import { createSignal, createMemo, Switch, Match, type JSX } from 'solid-js';
import { AccessPolicyEntry, MigrationAnalysis } from '../types';
import { LEGACY_KEY_VAULT_PERMISSIONS } from '../utils/permissionDefinitions';
import { analyzePolicies } from '../services/analysisService';
import { ArrowLeftIcon, ShieldCheckIcon } from './Icons';
import {
    CATEGORY_ORDER,
    Category,
    CategorySelection,
    emptySelection,
} from '../utils/permissionCategories';
import { useManualRoles } from '../hooks/useManualRoles';
import { RoleSourceSelector } from './RoleSourceSelector';
import { PermissionPicker } from './PermissionPicker';
import { EmptyHint, ManualResults } from './ManualResults';

interface ManualModePageProps {
    onBack: () => void;
    theme: 'light' | 'dark';
}

export const ManualModePage = (props: ManualModePageProps): JSX.Element => {
    const [selected, setSelected] = createSignal<CategorySelection>(emptySelection());
    const roles = useManualRoles();

    const totalSelected = createMemo(() =>
        CATEGORY_ORDER.reduce((sum, cat) => sum + selected()[cat].size, 0)
    );

    // Suggestions recompute live whenever the selection or the active role set changes.
    const result = createMemo<MigrationAnalysis | null>(() => {
        if (totalSelected() === 0) return null;
        const activeRoles = roles.activeRoles();
        if (!activeRoles || activeRoles.length === 0) return null;

        const sel = selected();
        const policy: AccessPolicyEntry = {
            tenantId: '',
            objectId: 'manual-selection',
            type: 'Unknown',
            displayName: 'Manual Selection',
            permissions: {
                keys: Array.from(sel.keys),
                secrets: Array.from(sel.secrets),
                certificates: Array.from(sel.certificates),
                storage: Array.from(sel.storage),
            },
        };

        return analyzePolicies([policy], activeRoles)[0] ?? null;
    });

    const togglePermission = (cat: Category, perm: string) => {
        setSelected((prev) => {
            const next = { ...prev, [cat]: new Set(prev[cat]) };
            if (next[cat].has(perm)) next[cat].delete(perm);
            else next[cat].add(perm);
            return next;
        });
    };

    // "Select all" is UI-only: it expands into the explicit legacy permissions for the
    // category, so the analysis never receives an ambiguous "All"/"*" pseudo-permission.
    const toggleCategoryAll = (cat: Category) => {
        const all = LEGACY_KEY_VAULT_PERMISSIONS[cat] || [];
        const allSelected = all.every((p) => selected()[cat].has(p));
        setSelected((prev) => ({
            ...prev,
            [cat]: allSelected ? new Set<string>() : new Set(all),
        }));
    };

    const clearAll = () => setSelected(emptySelection());

    return (
        <div class="min-h-screen flex items-start justify-center p-4 bg-neutral-100 dark:bg-neutral-900">
            <div class="max-w-6xl w-full bg-white dark:bg-neutral-800 shadow-fluent p-8 rounded-lg border border-neutral-200 dark:border-neutral-700 my-8">
                {/* Header */}
                <div class="flex items-center gap-4 mb-6">
                    <button
                        onClick={() => props.onBack()}
                        class="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-full transition-colors"
                        aria-label="Back"
                    >
                        <ArrowLeftIcon class="w-5 h-5 text-neutral-600 dark:text-neutral-400" />
                    </button>
                    <div>
                        <h2 class="text-2xl font-semibold text-neutral-900 dark:text-white">
                            Manual Mode
                        </h2>
                        <p class="text-neutral-600 dark:text-neutral-400 text-sm">
                            Hand-pick the permissions you need — role suggestions update live. Works
                            fully offline using bundled built-in roles.
                        </p>
                    </div>
                </div>

                <RoleSourceSelector
                    roleSource={roles.roleSource()}
                    onSelectSource={roles.setRoleSource}
                    sourceStatus={roles.sourceStatus()}
                    pasteJson={roles.pasteJson()}
                    onChangePasteJson={roles.setPasteJson}
                    pasteError={roles.pasteError()}
                    token={roles.token()}
                    onChangeToken={roles.setToken}
                    subscriptions={roles.subscriptions()}
                    selectedSubId={roles.selectedSubId()}
                    onSelectSubscription={roles.selectSubscription}
                    loadingSubs={roles.loadingSubs()}
                    loadingRoles={roles.loadingRoles()}
                    tokenError={roles.tokenError()}
                    onLoadSubscriptions={roles.loadSubscriptions}
                    onLoadRoles={roles.loadRoles}
                />

                {/* Permissions: full width */}
                <PermissionPicker
                    selected={selected()}
                    totalSelected={totalSelected()}
                    onTogglePermission={togglePermission}
                    onToggleCategoryAll={toggleCategoryAll}
                    onClearAll={clearAll}
                />

                {/* Results */}
                <div class="mt-8 pt-6 border-t border-neutral-200 dark:border-neutral-700">
                    <h3 class="text-lg font-semibold text-neutral-900 dark:text-white mb-1 flex items-center gap-2">
                        <ShieldCheckIcon class="w-5 h-5 text-brand-600" /> Suggested Roles
                    </h3>
                    <p class="text-xs text-neutral-500 dark:text-neutral-400 mb-4">
                        Updates live as you change your selection. "Coverage" is how much of your
                        selection a suggestion satisfies — always review{' '}
                        <span class="font-semibold">excess</span>, since a high-coverage role may grant
                        more than you selected. (Excess is measured against known Key Vault data
                        actions.)
                    </p>

                    <Switch
                        fallback={<EmptyHint text="No suggestions available for this selection." />}
                    >
                        <Match when={totalSelected() === 0}>
                            <EmptyHint text="Select one or more permissions to see role suggestions." />
                        </Match>
                        <Match when={roles.activeRoles().length === 0}>
                            <EmptyHint
                                text={
                                    roles.roleSource() === 'paste'
                                        ? 'Paste valid role definitions JSON to see suggestions.'
                                        : 'Load role definitions from a subscription to see suggestions.'
                                }
                            />
                        </Match>
                        <Match when={result()}>{(r) => <ManualResults result={r()} />}</Match>
                    </Switch>
                </div>
            </div>
        </div>
    );
};
