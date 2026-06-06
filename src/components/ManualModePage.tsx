import React, { useEffect, useMemo, useState } from 'react';
import {
    AccessPolicyEntry,
    MigrationAnalysis,
    RoleDefinition,
    Subscription,
    SuggestedRole,
} from '../types';
import { LEGACY_KEY_VAULT_PERMISSIONS } from '../utils/permissionDefinitions';
import { analyzePolicies } from '../services/analysisService';
import { getBuiltInKeyVaultRoles } from '../utils/builtInRoles';
import { parseRolesJson } from '../utils/roleNormalization';
import {
    validateToken,
    getSubscriptions,
    getRoleDefinitions,
} from '../services/azureService';
import {
    ArrowLeftIcon,
    CheckCircleIcon,
    AlertTriangleIcon,
    LoaderIcon,
    ShieldCheckIcon,
} from './Icons';
import { Checkbox, CopyableCommand } from './ui';
import { PermissionVisualizer } from './PermissionVisualizer';

interface ManualModePageProps {
    onBack: () => void;
    theme: 'light' | 'dark';
}

type RoleSource = 'builtin' | 'paste' | 'token';

const CATEGORY_ORDER = ['keys', 'secrets', 'certificates', 'storage'] as const;
type Category = (typeof CATEGORY_ORDER)[number];

const CATEGORY_LABELS: Record<Category, string> = {
    keys: 'Keys',
    secrets: 'Secrets',
    certificates: 'Certificates',
    storage: 'Storage',
};

const emptySelection = (): Record<Category, Set<string>> => ({
    keys: new Set(),
    secrets: new Set(),
    certificates: new Set(),
    storage: new Set(),
});

export const ManualModePage: React.FC<ManualModePageProps> = ({ onBack }) => {
    const [selected, setSelected] = useState<Record<Category, Set<string>>>(emptySelection);

    const [roleSource, setRoleSource] = useState<RoleSource>('builtin');

    // Paste source
    const [pasteJson, setPasteJson] = useState('');
    const [pastedRoles, setPastedRoles] = useState<RoleDefinition[]>([]);
    const [pasteError, setPasteError] = useState<string | null>(null);

    // Live token source
    const [token, setToken] = useState('');
    const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
    const [selectedSubId, setSelectedSubId] = useState('');
    const [loadingSubs, setLoadingSubs] = useState(false);
    const [loadingRoles, setLoadingRoles] = useState(false);
    const [tokenRoles, setTokenRoles] = useState<RoleDefinition[]>([]);
    const [tokenError, setTokenError] = useState<string | null>(null);

    const builtInRoles = useMemo(() => getBuiltInKeyVaultRoles(), []);

    const totalSelected = useMemo(
        () => CATEGORY_ORDER.reduce((sum, cat) => sum + selected[cat].size, 0),
        [selected]
    );

    // The active role set depends on the chosen source.
    const activeRoles =
        roleSource === 'builtin' ? builtInRoles : roleSource === 'paste' ? pastedRoles : tokenRoles;

    // Parse pasted JSON live as the user types.
    useEffect(() => {
        if (roleSource !== 'paste') return;
        if (!pasteJson.trim()) {
            setPastedRoles([]);
            setPasteError(null);
            return;
        }
        try {
            setPastedRoles(parseRolesJson(pasteJson));
            setPasteError(null);
        } catch (e: any) {
            setPastedRoles([]);
            setPasteError(e?.message || 'Invalid JSON.');
        }
    }, [pasteJson, roleSource]);

    // Suggestions recompute live whenever the selection or the active role set changes.
    const result: MigrationAnalysis | null = useMemo(() => {
        if (totalSelected === 0) return null;
        if (!activeRoles || activeRoles.length === 0) return null;

        const policy: AccessPolicyEntry = {
            tenantId: '',
            objectId: 'manual-selection',
            type: 'Unknown',
            displayName: 'Manual Selection',
            permissions: {
                keys: Array.from(selected.keys),
                secrets: Array.from(selected.secrets),
                certificates: Array.from(selected.certificates),
                storage: Array.from(selected.storage),
            },
        };

        return analyzePolicies([policy], activeRoles)[0] ?? null;
    }, [selected, activeRoles, totalSelected]);

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
        const allSelected = all.every((p) => selected[cat].has(p));
        setSelected((prev) => ({
            ...prev,
            [cat]: allSelected ? new Set() : new Set(all),
        }));
    };

    const clearAll = () => setSelected(emptySelection());

    const handleLoadSubscriptions = async () => {
        setTokenError(null);
        setSubscriptions([]);
        setSelectedSubId('');
        setTokenRoles([]);

        if (!token.trim()) {
            setTokenError('Paste a Management token first.');
            return;
        }

        setLoadingSubs(true);
        try {
            await validateToken(token.trim());
            const subs = await getSubscriptions(token.trim());
            if (subs.length === 0) {
                setTokenError('Token is valid, but no subscriptions are visible to it.');
                return;
            }
            setSubscriptions(subs);
            setSelectedSubId(subs[0].subscriptionId);
        } catch (e: any) {
            setTokenError(e?.message || 'Failed to validate token.');
        } finally {
            setLoadingSubs(false);
        }
    };

    const handleLoadRoles = async () => {
        setTokenError(null);
        setTokenRoles([]);
        if (!selectedSubId) {
            setTokenError('Select a subscription first.');
            return;
        }
        setLoadingRoles(true);
        try {
            const roles = await getRoleDefinitions(token.trim(), selectedSubId);
            if (roles.length === 0) {
                setTokenError(
                    'Connected, but no Key Vault roles were found in the selected subscription.'
                );
                return;
            }
            setTokenRoles(roles);
        } catch (e: any) {
            setTokenError(e?.message || 'Failed to load role definitions.');
        } finally {
            setLoadingRoles(false);
        }
    };

    const tokenCommand =
        'az account get-access-token --resource https://management.azure.com -o tsv --query accessToken';

    const sourceStatus = (() => {
        if (roleSource === 'builtin') return `${builtInRoles.length} built-in roles loaded`;
        if (roleSource === 'paste')
            return pastedRoles.length > 0 ? `${pastedRoles.length} roles parsed` : 'No roles parsed yet';
        return tokenRoles.length > 0 ? `${tokenRoles.length} roles loaded` : 'No roles loaded yet';
    })();

    return (
        <div className="min-h-screen flex items-start justify-center p-4 bg-neutral-100 dark:bg-neutral-900">
            <div className="max-w-6xl w-full bg-white dark:bg-neutral-800 shadow-fluent p-8 rounded-lg border border-neutral-200 dark:border-neutral-700 my-8">
                {/* Header */}
                <div className="flex items-center gap-4 mb-6">
                    <button
                        onClick={onBack}
                        className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-full transition-colors"
                        aria-label="Back"
                    >
                        <ArrowLeftIcon className="w-5 h-5 text-neutral-600 dark:text-neutral-400" />
                    </button>
                    <div>
                        <h2 className="text-2xl font-semibold text-neutral-900 dark:text-white">
                            Manual Mode
                        </h2>
                        <p className="text-neutral-600 dark:text-neutral-400 text-sm">
                            Hand-pick the permissions you need — role suggestions update live. Works
                            fully offline using bundled built-in roles.
                        </p>
                    </div>
                </div>

                {/* Role source: compact segmented bar */}
                <div className="mb-6">
                    <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                        <h3 className="text-sm font-bold text-neutral-800 dark:text-neutral-200">
                            Role source
                        </h3>
                        <span className="text-xs text-neutral-400">{sourceStatus}</span>
                    </div>

                    <div className="inline-flex flex-wrap gap-1 p-1 rounded-lg bg-neutral-100 dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-700">
                        {(
                            [
                                ['builtin', 'Built-in (offline)'],
                                ['paste', 'Paste JSON'],
                                ['token', 'Live token'],
                            ] as [RoleSource, string][]
                        ).map(([value, label]) => (
                            <button
                                key={value}
                                onClick={() => setRoleSource(value)}
                                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                                    roleSource === value
                                        ? 'bg-white dark:bg-neutral-700 text-brand-600 dark:text-white shadow-sm'
                                        : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
                                }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>

                    {roleSource === 'paste' && (
                        <div className="mt-3 max-w-2xl">
                            <textarea
                                value={pasteJson}
                                onChange={(e) => setPasteJson(e.target.value)}
                                placeholder="Paste Role Definitions JSON (az role definition list output)..."
                                className="w-full h-32 p-3 font-mono text-xs rounded-sm bg-neutral-50 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 focus:border-brand-600 focus:ring-1 focus:ring-brand-600 outline-none resize-y"
                            />
                            {pasteError && (
                                <p className="text-xs text-red-600 font-medium mt-1">{pasteError}</p>
                            )}
                        </div>
                    )}

                    {roleSource === 'token' && (
                        <div className="mt-3 max-w-2xl space-y-2">
                            <CopyableCommand command={tokenCommand} commandId="manual-token" />
                            <textarea
                                value={token}
                                onChange={(e) => setToken(e.target.value)}
                                placeholder="Paste Management token..."
                                className="w-full h-20 p-3 font-mono text-xs rounded-sm bg-neutral-50 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 focus:border-brand-600 focus:ring-1 focus:ring-brand-600 outline-none resize-none"
                            />
                            <div className="flex items-center gap-2 flex-wrap">
                                <button
                                    onClick={handleLoadSubscriptions}
                                    disabled={loadingSubs}
                                    className="px-3 py-1.5 rounded text-xs font-medium bg-neutral-600 hover:bg-neutral-700 text-white flex items-center gap-2 disabled:opacity-50"
                                >
                                    {loadingSubs && <LoaderIcon className="animate-spin w-3.5 h-3.5" />}
                                    Load subscriptions
                                </button>
                                {subscriptions.length > 0 && (
                                    <>
                                        <select
                                            value={selectedSubId}
                                            onChange={(e) => {
                                                setSelectedSubId(e.target.value);
                                                setTokenRoles([]);
                                            }}
                                            className="flex-1 min-w-[140px] text-xs p-2 rounded bg-neutral-50 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 outline-none"
                                        >
                                            {subscriptions.map((s) => (
                                                <option key={s.subscriptionId} value={s.subscriptionId}>
                                                    {s.displayName}
                                                </option>
                                            ))}
                                        </select>
                                        <button
                                            onClick={handleLoadRoles}
                                            disabled={loadingRoles}
                                            className="px-3 py-1.5 rounded text-xs font-medium bg-brand-600 hover:bg-brand-700 text-white flex items-center gap-2 disabled:opacity-50"
                                        >
                                            {loadingRoles && (
                                                <LoaderIcon className="animate-spin w-3.5 h-3.5" />
                                            )}
                                            Load roles
                                        </button>
                                    </>
                                )}
                            </div>
                            {tokenError && (
                                <p className="text-xs text-red-600 font-medium">{tokenError}</p>
                            )}
                        </div>
                    )}
                </div>

                {/* Permissions: full width */}
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-bold text-neutral-800 dark:text-neutral-200">
                            Select permissions{' '}
                            <span className="font-normal text-neutral-500">
                                ({totalSelected} selected)
                            </span>
                        </h3>
                        <button
                            onClick={clearAll}
                            className="text-xs text-neutral-500 hover:text-brand-600 transition-colors"
                        >
                            Clear all
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 items-start">
                        {CATEGORY_ORDER.map((cat) => {
                            const all = LEGACY_KEY_VAULT_PERMISSIONS[cat] || [];
                            const selCount = selected[cat].size;
                            const allSelected = selCount > 0 && selCount === all.length;
                            const partiallySelected = selCount > 0 && selCount < all.length;

                            return (
                                <div
                                    key={cat}
                                    className="border border-neutral-200 dark:border-neutral-700 rounded p-3 bg-neutral-50/50 dark:bg-neutral-900/30"
                                >
                                    <div className="flex items-center gap-2 mb-2 pb-2 border-b border-neutral-200 dark:border-neutral-700">
                                        <Checkbox
                                            checked={allSelected}
                                            indeterminate={partiallySelected}
                                            onChange={() => toggleCategoryAll(cat)}
                                        />
                                        <span className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                                            {CATEGORY_LABELS[cat]}
                                        </span>
                                        <span className="text-xs text-neutral-400 ml-auto">
                                            {selCount}/{all.length}
                                        </span>
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        {all.map((perm) => (
                                            <label
                                                key={perm}
                                                className="flex items-center gap-2 cursor-pointer text-xs text-neutral-700 dark:text-neutral-300 select-none"
                                            >
                                                <Checkbox
                                                    checked={selected[cat].has(perm)}
                                                    onChange={() => togglePermission(cat, perm)}
                                                />
                                                {perm}
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Results */}
                <div className="mt-8 pt-6 border-t border-neutral-200 dark:border-neutral-700">
                    <h3 className="text-lg font-semibold text-neutral-900 dark:text-white mb-1 flex items-center gap-2">
                        <ShieldCheckIcon className="w-5 h-5 text-brand-600" /> Suggested Roles
                    </h3>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-4">
                        Updates live as you change your selection. "Coverage" is how much of your
                        selection a suggestion satisfies — always review{' '}
                        <span className="font-semibold">excess</span>, since a high-coverage role may
                        grant more than you selected. (Excess is measured against known Key Vault data
                        actions.)
                    </p>

                    {totalSelected === 0 ? (
                        <EmptyHint text="Select one or more permissions to see role suggestions." />
                    ) : activeRoles.length === 0 ? (
                        <EmptyHint
                            text={
                                roleSource === 'paste'
                                    ? 'Paste valid role definitions JSON to see suggestions.'
                                    : 'Load role definitions from a subscription to see suggestions.'
                            }
                        />
                    ) : result ? (
                        <ManualResults result={result} />
                    ) : (
                        <EmptyHint text="No suggestions available for this selection." />
                    )}
                </div>
            </div>
        </div>
    );
};

const EmptyHint: React.FC<{ text: string }> = ({ text }) => (
    <div className="p-4 rounded border border-dashed border-neutral-300 dark:border-neutral-700 text-sm text-neutral-500 dark:text-neutral-400 text-center">
        {text}
    </div>
);

/**
 * Picks the recommendation to highlight: best coverage, then least excess.
 */
const pickRecommendedIndex = (recs: SuggestedRole[]): number => {
    let best = -1;
    recs.forEach((r, i) => {
        if (r.roleNames.length === 0) return;
        if (best === -1) {
            best = i;
            return;
        }
        const b = recs[best];
        if (
            r.confidence > b.confidence ||
            (r.confidence === b.confidence &&
                r.excessPermissions.length < b.excessPermissions.length)
        ) {
            best = i;
        }
    });
    return best;
};

const ManualResults: React.FC<{ result: MigrationAnalysis }> = ({ result }) => {
    const recommendedIdx = useMemo(
        () => pickRecommendedIndex(result.recommendations),
        [result]
    );

    const hasAnyMatch = result.recommendations.some((r) => r.roleNames.length > 0);

    if (!hasAnyMatch) {
        return (
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900 rounded text-sm text-amber-700 dark:text-amber-300 flex items-center gap-2">
                <AlertTriangleIcon className="w-4 h-4" /> No matching roles were found for this
                selection from the chosen role source.
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {result.recommendations.map((rec, idx) => {
                if (rec.roleNames.length === 0) return null;
                const isRecommended = idx === recommendedIdx;
                return (
                    <div
                        key={`${rec.strategy}-${idx}`}
                        className={`rounded border p-4 ${
                            isRecommended
                                ? 'border-brand-600 bg-brand-50/40 dark:bg-brand-900/10'
                                : 'border-neutral-200 dark:border-neutral-700'
                        }`}
                    >
                        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-neutral-900 dark:text-white">
                                    {rec.roleNames.join(' + ')}
                                </span>
                                {isRecommended && (
                                    <span className="text-[10px] uppercase font-bold tracking-wide bg-brand-600 text-white px-2 py-0.5 rounded flex items-center gap-1">
                                        <CheckCircleIcon className="w-3 h-3" /> Recommended
                                    </span>
                                )}
                            </div>
                            <span className="text-xs text-neutral-500">{rec.strategy}</span>
                        </div>

                        <div className="grid grid-cols-3 gap-3 mb-3">
                            <Metric
                                label="Coverage"
                                value={`${rec.confidence}%`}
                                tone={rec.confidence >= 80 ? 'good' : 'warn'}
                            />
                            <Metric
                                label="Excess"
                                value={`${rec.excessPermissions.length}`}
                                tone={rec.excessPermissions.length === 0 ? 'good' : 'warn'}
                            />
                            <Metric
                                label="Missing"
                                value={`${rec.missingPermissions.length}`}
                                tone={rec.missingPermissions.length === 0 ? 'good' : 'bad'}
                            />
                        </div>

                        <PermissionVisualizer
                            breakdown={rec.roleBreakdown}
                            missing={rec.missingPermissions}
                        />
                    </div>
                );
            })}
        </div>
    );
};

const Metric: React.FC<{ label: string; value: string; tone: 'good' | 'warn' | 'bad' }> = ({
    label,
    value,
    tone,
}) => {
    const toneClass =
        tone === 'good'
            ? 'text-green-600 dark:text-green-400'
            : tone === 'warn'
            ? 'text-amber-600 dark:text-amber-400'
            : 'text-red-600 dark:text-red-400';
    return (
        <div className="p-2 rounded bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-700 text-center">
            <div className={`text-lg font-semibold ${toneClass}`}>{value}</div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                {label}
            </div>
        </div>
    );
};
