import { For, Show, Switch, Match, type Component, type JSX } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { MigrationAnalysis, IdentityType } from '../types';
import {
    UserIcon,
    GroupIcon,
    AppIcon,
    UnknownIcon,
    CheckCircleIcon,
    ShieldCheckIcon,
    CompoundIdentityIcon,
} from './Icons';
import { PermissionVisualizer } from './PermissionVisualizer';
import { CoverageBanner } from './CoverageBanner';
import { Checkbox } from './ui';
import { getPolicyKey } from '../utils/policyKey';
import {
    IdentityIconKind,
    describeIdentity,
    identityIconKind,
    isCompoundIdentity,
    resolveIdentityType,
    shouldShowObjectIdSeparately,
} from '../utils/identity';
import {
    ConfidenceLevel,
    confidenceLevel,
    existingCoverageBadge,
    showsCompleteCoverage,
} from '../utils/resultPresentation';

export const KIND_ICON: Record<IdentityIconKind, Component<{ class?: string }>> = {
    compound: CompoundIdentityIcon,
    user: UserIcon,
    group: GroupIcon,
    app: AppIcon,
    unknown: UnknownIcon,
};

const CONFIDENCE_CLASS: Record<ConfidenceLevel, string> = {
    high: 'text-green-700 bg-green-50 dark:text-green-400 dark:bg-green-900/20',
    mid: 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-900/20',
    low: 'text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-900/20',
};

interface IdentityResultCardProps {
    res: MigrationAnalysis;
    resolvedNames: Record<string, { name: string; type: IdentityType }>;
    selectedRoleIdx: number;
    onSelectRole: (recIdx: number) => void;
    isSelected: boolean;
    onToggleSelection: () => void;
    showSuggestions: boolean;
    onToggleSuggestions: () => void;
    showCoverageDetails: boolean;
    onToggleCoverageDetails: () => void;
    showPolicyDetails: boolean;
    onTogglePolicyDetails: () => void;
}

export const IdentityResultCard = (props: IdentityResultCardProps): JSX.Element => {
    const policyKey = () => getPolicyKey(props.res.originalPolicy);
    const activeRec = () => props.res.recommendations[props.selectedRoleIdx];
    const displayName = () => describeIdentity(props.res.originalPolicy, props.resolvedNames).displayName;
    const hasAppId = () => isCompoundIdentity(props.res.originalPolicy);
    const currentType = () => resolveIdentityType(props.res.originalPolicy, props.resolvedNames);
    const isKnown = () => !!displayName();
    const isFullyCovered = () => props.res.existingCoverage?.isFullyCovered;
    const showRecs = () => !isFullyCovered() || props.showSuggestions;

    return (
        <div class="group hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
            <div class="grid grid-cols-12 gap-4 px-6 py-4 items-start">
                {/* Identity Column */}
                <div class="col-span-3 pr-2">
                    <div class="flex items-start gap-4">
                        <Checkbox
                            checked={props.isSelected}
                            onChange={() => props.onToggleSelection()}
                            class="mt-1"
                        />
                        <div
                            class={`mt-0.5 w-6 h-6 rounded flex items-center justify-center shrink-0 ${
                                isKnown()
                                    ? 'bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-300'
                                    : 'bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-400'
                            }`}
                        >
                            <Dynamic
                                component={KIND_ICON[identityIconKind(hasAppId(), currentType())]}
                                class="w-4 h-4"
                            />
                        </div>
                        <div class="min-w-0 flex-1">
                            <Show
                                when={isKnown()}
                                fallback={
                                    <div class="font-mono text-xs text-neutral-600 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded border border-neutral-200 dark:border-neutral-700 break-all">
                                        {props.res.originalPolicy.objectId}
                                    </div>
                                }
                            >
                                <div class="font-medium text-sm text-neutral-900 dark:text-white break-words">
                                    {displayName()}
                                </div>
                            </Show>

                            {/* Show Object ID in smaller font if we have a name */}
                            <Show
                                when={shouldShowObjectIdSeparately(
                                    displayName(),
                                    props.res.originalPolicy.objectId
                                )}
                            >
                                <div class="text-[10px] text-neutral-500 dark:text-neutral-500 font-mono mt-0.5 truncate">
                                    {props.res.originalPolicy.objectId}
                                </div>
                            </Show>

                            {/* Details about Type and AppID if available */}
                            <div class="text-[10px] text-neutral-600 dark:text-neutral-400 mt-1 flex flex-col gap-0.5">
                                <Show when={hasAppId()}>
                                    <span title="Application ID">
                                        App ID: {props.res.originalPolicy.applicationId}
                                    </span>
                                </Show>
                                <Show when={currentType() !== 'Unknown'}>
                                    <span class="opacity-75">{currentType()}</span>
                                </Show>
                            </div>

                            {/* Existing Coverage Badge */}
                            <Show when={existingCoverageBadge(props.res.existingCoverage) === 'covered'}>
                                <div class="mt-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-[10px] font-medium border border-green-200 dark:border-green-800">
                                    <CheckCircleIcon class="w-3 h-3" />
                                    Already Covered
                                </div>
                            </Show>
                            <Show when={existingCoverageBadge(props.res.existingCoverage) === 'partial'}>
                                <div class="mt-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 text-[10px] font-medium border border-blue-100 dark:border-blue-800">
                                    <ShieldCheckIcon class="w-3 h-3" />
                                    Partially Covered
                                </div>
                            </Show>

                            {/* Fallback message if resolution fails completely and no other info */}
                            <Show when={!isKnown() && !props.res.originalPolicy.applicationId}>
                                <div class="text-[10px] text-amber-600 dark:text-amber-500 mt-1">
                                    Resolution Failed
                                </div>
                            </Show>

                            {/* Original Policy View Toggle */}
                            <button
                                onClick={() => props.onTogglePolicyDetails()}
                                class="mt-2 block text-[10px] font-medium text-brand-600 dark:text-brand-400 hover:underline focus:outline-none"
                            >
                                {props.showPolicyDetails ? 'Hide Legacy Policy' : 'View Legacy Policy'}
                            </button>

                            {/* Original Policy Details */}
                            <Show when={props.showPolicyDetails}>
                                <div class="mt-2 p-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded text-[10px]">
                                    <For each={Object.entries(props.res.originalPolicy.permissions)}>
                                        {([category, perms]) => (
                                            <Show when={perms && perms.length > 0}>
                                                <div class="mb-1 last:mb-0">
                                                    <span class="font-semibold text-neutral-700 dark:text-neutral-300 capitalize">
                                                        {category}:
                                                    </span>
                                                    <div class="flex flex-wrap gap-1 mt-0.5">
                                                        <For each={perms}>
                                                            {(p) => (
                                                                <span class="px-1 py-0.5 bg-white dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 rounded text-neutral-600 dark:text-neutral-300">
                                                                    {p}
                                                                </span>
                                                            )}
                                                        </For>
                                                    </div>
                                                </div>
                                            </Show>
                                        )}
                                    </For>
                                </div>
                            </Show>
                        </div>
                    </div>
                </div>

                {/* Recommendations Column */}
                <div class="col-span-4">
                    {/* Selection Tabs for Strategies */}
                    <Show when={props.res.recommendations.length > 0}>
                        <div class={`flex flex-wrap gap-2 mb-3 ${!showRecs() ? 'opacity-50 grayscale' : ''}`}>
                            <For each={props.res.recommendations}>
                                {(rec, recIdx) => (
                                    <button
                                        onClick={() => props.onSelectRole(recIdx())}
                                        disabled={!showRecs()}
                                        class={`px-2 py-1 rounded-sm text-[10px] font-bold uppercase tracking-wide border transition-all ${
                                            props.selectedRoleIdx === recIdx()
                                                ? 'bg-brand-50 border-brand-200 text-brand-700 dark:bg-brand-900/20 dark:border-brand-800 dark:text-brand-300'
                                                : 'bg-white border-neutral-200 text-neutral-500 hover:border-brand-300 hover:text-neutral-700 dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'
                                        }`}
                                        title={rec.reasoning}
                                    >
                                        {rec.strategy}
                                    </button>
                                )}
                            </For>
                        </div>
                    </Show>

                    {/* Active Role Display */}
                    <div class={`flex flex-wrap gap-1.5 mb-2 ${!showRecs() ? 'opacity-50' : ''}`}>
                        <Show
                            when={activeRec().roleNames && activeRec().roleNames.length > 0}
                            fallback={
                                <span class="font-semibold text-sm text-neutral-800 dark:text-neutral-200">
                                    {activeRec().roleName}
                                </span>
                            }
                        >
                            <For each={activeRec().roleNames}>
                                {(roleName) => (
                                    <span class="inline-flex items-center px-2 py-1 rounded bg-neutral-100 dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 text-xs font-medium text-neutral-800 dark:text-neutral-200">
                                        {roleName}
                                    </span>
                                )}
                            </For>
                        </Show>
                    </div>

                    <div
                        class={`text-xs text-neutral-700 dark:text-neutral-400 line-clamp-3 group-hover:line-clamp-none transition-all ${
                            !showRecs() ? 'opacity-50' : ''
                        }`}
                    >
                        {activeRec().reasoning}
                    </div>
                </div>

                {/* Confidence */}
                <div class="col-span-2 text-right">
                    <span
                        class={`inline-block px-2 py-0.5 rounded text-xs font-bold ${
                            CONFIDENCE_CLASS[confidenceLevel(activeRec().confidence)]
                        }`}
                    >
                        {activeRec().confidence}%
                    </span>
                </div>

                {/* Gaps Analysis */}
                <div class="col-span-3">
                    <div class="flex flex-col gap-1">
                        <Show when={props.res.existingCoverage}>
                            <CoverageBanner
                                existingCoverage={props.res.existingCoverage!}
                                objectId={policyKey()}
                                showDetails={props.showCoverageDetails}
                                onToggleDetails={() => props.onToggleCoverageDetails()}
                                showSuggestions={props.showSuggestions}
                                onToggleSuggestions={() => props.onToggleSuggestions()}
                            />
                        </Show>

                        <Show
                            when={showsCompleteCoverage(
                                activeRec().missingPermissions.length,
                                props.res.existingCoverage
                            )}
                        >
                            <div class="flex items-center gap-1.5 text-green-700 dark:text-green-400 text-xs font-semibold mb-1">
                                <CheckCircleIcon class="w-3.5 h-3.5" />
                                <span>Complete Coverage</span>
                            </div>
                        </Show>

                        <Show when={showRecs()}>
                            <PermissionVisualizer
                                breakdown={activeRec().roleBreakdown || []}
                                missing={activeRec().missingPermissions}
                            />
                        </Show>
                    </div>
                </div>
            </div>
        </div>
    );
};
