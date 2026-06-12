import {
    createSignal,
    createEffect,
    on,
    onCleanup,
    lazy,
    Suspense,
    Show,
    For,
    type JSX,
} from 'solid-js';
import { MigrationStatus, KeyVault, RoleDefinition } from '../types';
import { useAzureData, useAnalysis, useExport, ExportFormat } from '../hooks';
import { ArrowRightIcon, LoaderIcon, ShieldCheckIcon, CheckCircleIcon, DownloadIcon } from './Icons';
import { SidePanel } from './SidePanel';
import { getPolicyKey } from '../utils/policyKey';
import { isCompoundIdentity, resolveIdentityType } from '../utils/identity';

// Lazily loaded so the results bundle (charts + the full results tree) is only
// fetched once an analysis completes, keeping the initial bundle small.
const AnalysisResults = lazy(() =>
    import('./AnalysisResults').then((m) => ({ default: m.AnalysisResults }))
);

interface DashboardProps {
    armToken: string;
    graphToken?: string;
    theme: 'light' | 'dark';
    offlineData?: { vaults: KeyVault[]; roles: RoleDefinition[] } | null;
}

export const Dashboard = (props: DashboardProps): JSX.Element => {
    const [includeCustomRoles, setIncludeCustomRoles] = createSignal(true);

    const data = useAzureData({
        armToken: () => props.armToken,
        graphToken: () => props.graphToken,
        offlineData: () => props.offlineData,
    });

    const analysis = useAnalysis({
        selectedVault: data.selectedVault,
        availableRoles: data.availableRoles,
        roleAssignments: data.roleAssignments,
        resolvedNames: data.resolvedNames,
        includeCustomRoles,
    });

    const exp = useExport({
        results: analysis.results,
        selectedRoles: analysis.selectedRoles,
        resolvedNames: data.resolvedNames,
        selectedForExport: analysis.selectedForExport,
        vaultName: () => data.selectedVault()?.name || '',
        subscriptionId: () => data.selectedSub()?.subscriptionId || '',
        vaultResourceId: () => data.selectedVault()?.id || '',
        theme: () => props.theme,
    });

    // Close the export dropdown when clicking outside of it.
    let exportMenuRef: HTMLDivElement | undefined;
    createEffect(() => {
        if (!exp.showExportMenu()) return;
        const handleClickOutside = (event: MouseEvent) => {
            if (exportMenuRef && event.target instanceof Node && !exportMenuRef.contains(event.target)) {
                exp.setShowExportMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        onCleanup(() => document.removeEventListener('mousedown', handleClickOutside));
    });

    // Resolve identities when results change.
    createEffect(
        on(analysis.results, (results) => {
            if (results.length > 0 && !props.offlineData) {
                const idsToResolve: string[] = [];
                results.forEach((r) => {
                    idsToResolve.push(r.originalPolicy.objectId);
                    if (isCompoundIdentity(r.originalPolicy)) {
                        idsToResolve.push(r.originalPolicy.applicationId!);
                    }
                });
                data.resolveIdentities(idsToResolve);
            }
        })
    );

    // Reset auto-add tracking whenever a new analysis run produces fresh results.
    let autoAddedExportKeys = new Set<string>();
    createEffect(
        on(analysis.results, () => {
            autoAddedExportKeys = new Set();
        })
    );

    // When identity names/types resolve, auto-include identities that transition from Unknown to a
    // known type — but only once each, so the user's manual export de-selections are preserved.
    createEffect(
        on([data.resolvedNames, analysis.results], () => {
            const results = analysis.results();
            if (results.length === 0) return;

            const newlyKnown: string[] = [];
            results.forEach((r) => {
                const key = getPolicyKey(r.originalPolicy);
                const type = resolveIdentityType(r.originalPolicy, data.resolvedNames());
                if (type !== 'Unknown' && !autoAddedExportKeys.has(key)) {
                    newlyKnown.push(key);
                }
            });

            if (newlyKnown.length === 0) return;

            newlyKnown.forEach((key) => autoAddedExportKeys.add(key));
            analysis.setSelectedForExport((prev) => {
                const next = new Set(prev);
                newlyKnown.forEach((key) => next.add(key));
                return next;
            });
        })
    );

    const handleAnalyze = async () => {
        if (!data.selectedVault()) return;
        data.setStatus(MigrationStatus.ANALYZING);

        try {
            await analysis.runAnalysis();
            data.setStatus(MigrationStatus.COMPLETE);
        } catch (err) {
            console.error(err);
            data.setStatus(MigrationStatus.ERROR);
        }
    };

    const handleSelectVault = (vault: KeyVault) => {
        data.setSelectedVault(vault);
        data.setStatus(MigrationStatus.IDLE);
        analysis.clearResults();
    };

    const resetToSubscriptions = () => {
        data.setSelectedSub(null);
        data.setSelectedVault(null);
        analysis.clearResults();
    };

    const resetToVaults = () => {
        data.setSelectedVault(null);
        analysis.clearResults();
    };

    const builtInRoleCount = () =>
        data.availableRoles().filter((r) => r.properties.type === 'BuiltInRole').length;
    const customRoleCount = () =>
        data.availableRoles().filter((r) => r.properties.type === 'CustomRole').length;

    const controlsLocked = () =>
        data.status() === MigrationStatus.ANALYZING || data.status() === MigrationStatus.COMPLETE;

    return (
        <div class="max-w-[1600px] mx-auto p-6">
            {/* Breadcrumb Navigation */}
            <nav
                aria-label="Breadcrumb"
                class="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400 mb-6"
            >
                <button
                    onClick={resetToSubscriptions}
                    class="hover:underline cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-600 rounded px-1"
                >
                    Home
                </button>
                <span aria-hidden="true">/</span>
                <button
                    onClick={resetToVaults}
                    class={`hover:underline cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-600 rounded px-1 ${
                        data.selectedSub() ? 'text-neutral-900 dark:text-white font-semibold' : ''
                    }`}
                >
                    Subscriptions
                </button>
                <Show when={data.selectedSub()}>
                    <span aria-hidden="true">/</span>
                    <button
                        onClick={resetToVaults}
                        class={`hover:underline cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-600 rounded px-1 ${
                            data.selectedVault() ? 'text-neutral-900 dark:text-white font-semibold' : ''
                        }`}
                    >
                        {data.selectedSub()!.displayName}
                    </button>
                </Show>
                <Show when={data.selectedVault()}>
                    <span aria-hidden="true">/</span>
                    <span
                        class="text-neutral-900 dark:text-white font-semibold"
                        aria-current="page"
                    >
                        {data.selectedVault()!.name}
                    </span>
                </Show>
            </nav>

            <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Left Column: Selection Panel */}
                <SidePanel
                    subscriptions={data.subscriptions()}
                    selectedSub={data.selectedSub()}
                    onSelectSub={data.setSelectedSub}
                    vaults={data.vaults()}
                    selectedVault={data.selectedVault()}
                    onSelectVault={handleSelectVault}
                    isLoading={data.status() === MigrationStatus.LOADING}
                />

                {/* Right Column: Workspace */}
                <div class="lg:col-span-9 bg-white dark:bg-neutral-800 rounded border border-neutral-200 dark:border-neutral-700 shadow-sm min-h-[600px] flex flex-col">
                    {/* Workspace Header */}
                    <div class="px-6 py-4 border-b border-neutral-200 dark:border-neutral-700 flex justify-between items-center bg-neutral-50 dark:bg-neutral-800/50">
                        <h2 class="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                            {data.selectedVault()
                                ? `Analysis: ${data.selectedVault()!.name}`
                                : 'Migration Workspace'}
                        </h2>
                        <div class="flex items-center gap-2">
                            {/* Export Menu */}
                            <Show when={data.status() === MigrationStatus.COMPLETE}>
                                <div class="relative" ref={exportMenuRef}>
                                    <button
                                        onClick={() => exp.setShowExportMenu(!exp.showExportMenu())}
                                        class="px-4 py-1.5 rounded text-sm font-medium bg-neutral-600 hover:bg-neutral-700 text-white flex items-center gap-2 transition-colors"
                                    >
                                        <DownloadIcon class="w-4 h-4" /> Export
                                    </button>
                                    <Show when={exp.showExportMenu()}>
                                        <div class="absolute right-0 top-full mt-1 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded shadow-lg z-10 min-w-[160px]">
                                            <For each={['csv', 'json', 'powershell', 'html'] as ExportFormat[]}>
                                                {(format) => (
                                                    <button
                                                        onClick={() => exp.handleExport(format)}
                                                        class="w-full px-4 py-2 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
                                                    >
                                                        Export as {format.toUpperCase()}
                                                    </button>
                                                )}
                                            </For>
                                        </div>
                                    </Show>
                                </div>
                            </Show>

                            {/* Analysis Controls */}
                            <Show when={data.selectedVault()}>
                                <div class="flex items-center gap-4">
                                    {/* Custom Role Toggle */}
                                    <label class="flex items-center gap-2 cursor-pointer select-none">
                                        <div class="relative">
                                            <input
                                                type="checkbox"
                                                class="sr-only peer"
                                                checked={includeCustomRoles()}
                                                onChange={(e) =>
                                                    setIncludeCustomRoles(e.currentTarget.checked)
                                                }
                                                disabled={controlsLocked()}
                                            />
                                            <div class="w-9 h-5 bg-neutral-300 dark:bg-neutral-600 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-600" />
                                        </div>
                                        <span
                                            class={`text-sm font-medium ${
                                                controlsLocked()
                                                    ? 'text-neutral-400'
                                                    : 'text-neutral-700 dark:text-neutral-300'
                                            }`}
                                        >
                                            Include Custom Roles
                                        </span>
                                    </label>

                                    {/* Analyze Button */}
                                    <button
                                        onClick={handleAnalyze}
                                        disabled={controlsLocked()}
                                        class={`px-4 py-1.5 rounded text-sm font-medium transition-colors flex items-center gap-2 ${
                                            data.status() === MigrationStatus.COMPLETE
                                                ? 'bg-green-600 text-white cursor-default'
                                                : 'bg-brand-600 hover:bg-brand-700 text-white shadow-sm'
                                        }`}
                                    >
                                        <Show when={data.status() === MigrationStatus.ANALYZING}>
                                            <LoaderIcon class="animate-spin w-4 h-4" /> Processing...
                                        </Show>
                                        <Show when={data.status() === MigrationStatus.COMPLETE}>
                                            <CheckCircleIcon class="w-4 h-4" /> Analysis Complete
                                        </Show>
                                        <Show
                                            when={
                                                data.status() !== MigrationStatus.ANALYZING &&
                                                data.status() !== MigrationStatus.COMPLETE
                                            }
                                        >
                                            Run Analysis <ArrowRightIcon class="w-4 h-4" />
                                        </Show>
                                    </button>
                                </div>
                            </Show>
                        </div>
                    </div>

                    {/* Workspace Content */}
                    <div class="p-6 flex-1">
                        {/* Empty State - No Vault Selected */}
                        <Show
                            when={data.status() === MigrationStatus.IDLE && !data.selectedVault()}
                        >
                            <div class="h-full flex flex-col items-center justify-center text-neutral-500 dark:text-neutral-400">
                                <div class="bg-neutral-100 dark:bg-neutral-700/50 p-6 rounded-full mb-4">
                                    <ShieldCheckIcon class="w-12 h-12 text-neutral-400 dark:text-neutral-500" />
                                </div>
                                <p class="text-lg font-medium text-neutral-800 dark:text-neutral-300">
                                    No Vault Selected
                                </p>
                                <p class="text-sm text-neutral-700 dark:text-neutral-400">
                                    Please select a Subscription and Key Vault from the left panel.
                                </p>
                            </div>
                        </Show>

                        {/* Ready State - Vault Selected */}
                        <Show when={data.status() === MigrationStatus.IDLE && data.selectedVault()}>
                            <div class="h-full flex flex-col items-center justify-center">
                                <div class="w-full max-w-2xl text-center">
                                    <h3 class="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
                                        Ready to Analyze
                                    </h3>
                                    <p class="text-neutral-700 dark:text-neutral-400 mb-4">
                                        This vault has{' '}
                                        <strong class="text-neutral-900 dark:text-white">
                                            {data.selectedVault()!.accessPolicies.length}
                                        </strong>{' '}
                                        legacy access policies defined.
                                    </p>
                                    <p class="text-sm text-neutral-600 dark:text-neutral-400 mb-8">
                                        We have loaded{' '}
                                        <strong class="text-neutral-900 dark:text-neutral-200">
                                            {data.availableRoles().length}
                                        </strong>{' '}
                                        RBAC roles (Built-in & Custom) from your subscription to find
                                        the best match.
                                    </p>

                                    <div class="grid grid-cols-3 gap-4 mb-8">
                                        <div class="p-4 bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-700 rounded">
                                            <div class="text-2xl font-light text-brand-600">
                                                {data.selectedVault()!.accessPolicies.length}
                                            </div>
                                            <div class="text-xs font-semibold uppercase text-neutral-700 dark:text-neutral-400 tracking-wide mt-1">
                                                Total Policies
                                            </div>
                                        </div>
                                        <div class="p-4 bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-700 rounded">
                                            <div class="text-2xl font-light text-neutral-800 dark:text-neutral-200">
                                                {builtInRoleCount()}
                                            </div>
                                            <div class="text-xs font-semibold uppercase text-neutral-700 dark:text-neutral-400 tracking-wide mt-1">
                                                Built-in Roles
                                            </div>
                                        </div>
                                        <div class="p-4 bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-700 rounded">
                                            <div class="text-2xl font-light text-neutral-800 dark:text-neutral-200">
                                                {customRoleCount()}
                                            </div>
                                            <div class="text-xs font-semibold uppercase text-neutral-700 dark:text-neutral-400 tracking-wide mt-1">
                                                Custom Roles
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </Show>

                        {/* Analyzing State */}
                        <Show when={data.status() === MigrationStatus.ANALYZING}>
                            <div class="h-full flex flex-col items-center justify-center">
                                <div class="relative w-20 h-20 mb-8">
                                    <div class="absolute inset-0 border-4 border-neutral-200 dark:border-neutral-700 rounded-full" />
                                    <div class="absolute inset-0 border-4 border-brand-600 rounded-full border-t-transparent animate-spin" />
                                </div>
                                <p class="text-lg font-medium text-neutral-900 dark:text-neutral-200">
                                    Mapping Roles...
                                </p>
                                <p class="text-sm text-neutral-700 dark:text-neutral-400 mt-2 max-w-md text-center">
                                    Applying 3 weighted algorithmic strategies to determine optimal
                                    RBAC mappings.
                                </p>
                            </div>
                        </Show>

                        {/* Complete State - Show Results */}
                        <Show when={data.status() === MigrationStatus.COMPLETE}>
                            <Suspense
                                fallback={
                                    <div class="h-full flex flex-col items-center justify-center text-neutral-500 dark:text-neutral-400">
                                        <LoaderIcon class="animate-spin w-6 h-6 text-brand-600 mb-3" />
                                        <p class="text-sm">Loading results…</p>
                                    </div>
                                }
                            >
                                <AnalysisResults
                                    results={analysis.results()}
                                    selectedRoles={analysis.selectedRoles()}
                                    setSelectedRoles={analysis.setSelectedRoles}
                                    resolvedNames={data.resolvedNames()}
                                    theme={props.theme}
                                    selectedForExport={analysis.selectedForExport()}
                                    setSelectedForExport={analysis.setSelectedForExport}
                                />
                            </Suspense>
                        </Show>
                    </div>
                </div>
            </div>
        </div>
    );
};
