import { createSignal, createMemo, For, Show, type Setter, type JSX } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { MigrationAnalysis, IdentityType } from '../types';
import { Checkbox } from './ui';
import { getPolicyKey } from '../utils/policyKey';
import {
    groupResultsByType,
    flattenInDisplayOrder,
    toCoverageChartData,
    collectDisplayGroup,
    IDENTITY_DISPLAY_GROUPS,
} from '../utils/identityGrouping';
import { CoverageChart } from './CoverageChart';
import { IdentityResultCard, KIND_ICON } from './IdentityResultCard';

interface AnalysisResultsProps {
    results: MigrationAnalysis[];
    selectedRoles: Record<string, number>;
    setSelectedRoles: Setter<Record<string, number>>;
    resolvedNames: Record<string, { name: string; type: IdentityType }>;
    theme: 'light' | 'dark';
    selectedForExport: Set<string>;
    setSelectedForExport: Setter<Set<string>>;
}

type SelectionState = 'all' | 'some' | 'none';

export const AnalysisResults = (props: AnalysisResultsProps): JSX.Element => {
    const groupedResults = createMemo(() =>
        groupResultsByType(props.results, props.resolvedNames)
    );

    const activeData = createMemo(() =>
        toCoverageChartData(
            flattenInDisplayOrder(groupedResults()),
            props.selectedRoles,
            props.resolvedNames
        )
    );

    const [showSuggestions, setShowSuggestions] = createSignal<Record<string, boolean>>({});
    const [showCoverageDetails, setShowCoverageDetails] = createSignal<Record<string, boolean>>({});
    const [showPolicyDetails, setShowPolicyDetails] = createSignal<Record<string, boolean>>({});

    const toggleSuggestion = (id: string) =>
        setShowSuggestions((prev) => ({ ...prev, [id]: !prev[id] }));
    const toggleCoverageDetails = (id: string) =>
        setShowCoverageDetails((prev) => ({ ...prev, [id]: !prev[id] }));
    const togglePolicyDetails = (id: string) =>
        setShowPolicyDetails((prev) => ({ ...prev, [id]: !prev[id] }));

    const toggleItemSelection = (policyKey: string) => {
        props.setSelectedForExport((prev) => {
            const next = new Set(prev);
            if (next.has(policyKey)) next.delete(policyKey);
            else next.add(policyKey);
            return next;
        });
    };

    const toggleCategorySelection = (groupData: MigrationAnalysis[]) => {
        const ids = groupData.map((r) => getPolicyKey(r.originalPolicy));
        const allSelected = ids.every((id) => props.selectedForExport.has(id));
        props.setSelectedForExport((prev) => {
            const next = new Set(prev);
            if (allSelected) ids.forEach((id) => next.delete(id));
            else ids.forEach((id) => next.add(id));
            return next;
        });
    };

    const toggleAllSelection = () => {
        const allIds = props.results.map((r) => getPolicyKey(r.originalPolicy));
        const allSelected = allIds.every((id) => props.selectedForExport.has(id));
        props.setSelectedForExport(() => (allSelected ? new Set<string>() : new Set(allIds)));
    };

    const getAllSelectionState = (): SelectionState => {
        const allIds = props.results.map((r) => getPolicyKey(r.originalPolicy));
        const selectedCount = allIds.filter((id) => props.selectedForExport.has(id)).length;
        if (selectedCount === 0) return 'none';
        if (selectedCount === allIds.length) return 'all';
        return 'some';
    };

    const getCategorySelectionState = (groupData: MigrationAnalysis[]): SelectionState => {
        const ids = groupData.map((r) => getPolicyKey(r.originalPolicy));
        const selectedCount = ids.filter((id) => props.selectedForExport.has(id)).length;
        if (selectedCount === 0) return 'none';
        if (selectedCount === ids.length) return 'all';
        return 'some';
    };

    return (
        <div class="space-y-8 fade-in-up">
            {/* Overview Charts */}
            <CoverageChart data={activeData()} theme={props.theme} />

            {/* Detailed List */}
            <div>
                <h3 class="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
                    Identity Mapping
                </h3>
                <div class="border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 overflow-clip">
                    <div class="grid grid-cols-12 gap-4 px-6 py-3 bg-neutral-50 dark:bg-neutral-900/50 border-b border-neutral-200 dark:border-neutral-700 text-xs font-semibold text-neutral-700 dark:text-neutral-400 uppercase tracking-wider">
                        <div class="col-span-3 flex items-center gap-4">
                            <Checkbox
                                checked={getAllSelectionState() === 'all'}
                                indeterminate={getAllSelectionState() === 'some'}
                                onChange={toggleAllSelection}
                            />
                            Identity
                        </div>
                        <div class="col-span-4">Recommended Role Combination</div>
                        <div class="col-span-2 text-right">Coverage</div>
                        <div class="col-span-3">Gap Analysis</div>
                    </div>

                    {/* Render identity sections in the shared display order */}
                    <For each={IDENTITY_DISPLAY_GROUPS}>
                        {(group) => {
                            const groupData = () => collectDisplayGroup(groupedResults(), group);
                            return (
                                <Show when={groupData().length > 0}>
                                    <div class="px-6 py-2 bg-neutral-100 dark:bg-neutral-900 border-y border-neutral-200 dark:border-neutral-700 font-semibold text-xs text-neutral-800 dark:text-neutral-300 uppercase tracking-wider sticky top-12 z-10 flex items-center gap-4">
                                        <Checkbox
                                            checked={getCategorySelectionState(groupData()) === 'all'}
                                            indeterminate={
                                                getCategorySelectionState(groupData()) === 'some'
                                            }
                                            onChange={() => toggleCategorySelection(groupData())}
                                        />
                                        <Dynamic
                                            component={KIND_ICON[group.iconKind]}
                                            class="w-4 h-4"
                                        />
                                        {group.label}{' '}
                                        <span class="ml-1 opacity-60">({groupData().length})</span>
                                    </div>
                                    <div class="divide-y divide-neutral-100 dark:divide-neutral-800">
                                        <For each={groupData()}>
                                            {(res) => {
                                                const policyKey = getPolicyKey(res.originalPolicy);
                                                return (
                                                    <IdentityResultCard
                                                        res={res}
                                                        resolvedNames={props.resolvedNames}
                                                        selectedRoleIdx={props.selectedRoles[policyKey] || 0}
                                                        onSelectRole={(recIdx) =>
                                                            props.setSelectedRoles((prev) => ({
                                                                ...prev,
                                                                [policyKey]: recIdx,
                                                            }))
                                                        }
                                                        isSelected={props.selectedForExport.has(policyKey)}
                                                        onToggleSelection={() =>
                                                            toggleItemSelection(policyKey)
                                                        }
                                                        showSuggestions={!!showSuggestions()[policyKey]}
                                                        onToggleSuggestions={() =>
                                                            toggleSuggestion(policyKey)
                                                        }
                                                        showCoverageDetails={
                                                            !!showCoverageDetails()[policyKey]
                                                        }
                                                        onToggleCoverageDetails={() =>
                                                            toggleCoverageDetails(policyKey)
                                                        }
                                                        showPolicyDetails={!!showPolicyDetails()[policyKey]}
                                                        onTogglePolicyDetails={() =>
                                                            togglePolicyDetails(policyKey)
                                                        }
                                                    />
                                                );
                                            }}
                                        </For>
                                    </div>
                                </Show>
                            );
                        }}
                    </For>
                </div>
            </div>
        </div>
    );
};
