import React, { useMemo } from 'react';
import { MigrationAnalysis } from '../../core/types';
import { Checkbox } from '../primitives/Checkbox';
import { getPolicyKey, selectedRecommendationIndex } from '../../core/identity/policyKey';
import { ResolvedNames } from '../../core/identity/identity';
import {
  groupResultsByType,
  flattenInDisplayOrder,
  toCoverageChartRows,
  collectDisplayGroup,
  IDENTITY_DISPLAY_GROUPS,
} from '../../core/identity/grouping';
import { CoverageChart } from './CoverageChart';
import { ICON_BY_KIND, IdentityResultCard } from './IdentityResultCard';

interface AnalysisResultsProps {
  results: MigrationAnalysis[];
  selectedRoles: Record<string, number>;
  resolvedNames: ResolvedNames;
  onSelectRole?: (policyKey: string, recIdx: number) => void;
  /** Export selection; omitted in the static report. */
  selection?: {
    selected: Set<string>;
    onChange: React.Dispatch<React.SetStateAction<Set<string>>>;
  };
}

/**
 * The analysis view shared by the live dashboard and the exported HTML report,
 * which renders it statically (no handlers) and switches strategies with a script.
 */
export const AnalysisResults: React.FC<AnalysisResultsProps> = ({
  results,
  selectedRoles,
  resolvedNames,
  onSelectRole,
  selection,
}) => {
  const groupedResults = useMemo(() => groupResultsByType(results, resolvedNames), [results, resolvedNames]);
  const ordered = useMemo(() => flattenInDisplayOrder(groupedResults), [groupedResults]);
  const chartData = useMemo(() => toCoverageChartRows(ordered, resolvedNames), [ordered, resolvedNames]);
  const rowIds = new Map(ordered.map((res, i) => [res, `row${i}`]));
  const chartRows = ordered.map((res, i) => ({
    rowId: `row${i}`,
    selectedIdx: selectedRecommendationIndex(res, selectedRoles),
    data: chartData[i],
  }));

  const selectionState = (items: MigrationAnalysis[]): 'all' | 'some' | 'none' => {
    const count = items.filter((r) => selection?.selected.has(getPolicyKey(r.originalPolicy))).length;
    return count === 0 ? 'none' : count === items.length ? 'all' : 'some';
  };

  const toggleSelection = (items: MigrationAnalysis[]) => {
    const select = selectionState(items) !== 'all';
    selection?.onChange((prev) => {
      const next = new Set(prev);
      items.forEach((r) => (select ? next.add(getPolicyKey(r.originalPolicy)) : next.delete(getPolicyKey(r.originalPolicy))));
      return next;
    });
  };

  const selectionCheckbox = (label: string, items: MigrationAnalysis[]) => {
    if (!selection) return null;
    const state = selectionState(items);
    return (
      <Checkbox
        label={label}
        checked={state === 'all'}
        indeterminate={state === 'some'}
        onChange={() => toggleSelection(items)}
      />
    );
  };

  return (
    <div className="min-w-0 space-y-6 fade-in-up sm:space-y-8">
      <CoverageChart rows={chartRows} />

      <div>
        <p className="mb-4 text-sm text-neutral-700 dark:text-neutral-300">
          Existing coverage includes only assignments to each listed principal at the vault,
          resource-group, subscription, or root scope. Group membership, management-group
          inheritance, and other effective-access restrictions are not evaluated.
          PowerShell export skips compound identities and identities already covered by these assignments.
        </p>
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-4">Identity Mapping</h3>
        <div className="border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 overflow-hidden">
          <div className="hidden 2xl:grid grid-cols-12 gap-4 px-6 py-3 bg-neutral-50 dark:bg-neutral-900/50 border-b border-neutral-200 dark:border-neutral-700 text-xs font-semibold text-neutral-700 dark:text-neutral-400 uppercase tracking-wider">
            <div className="col-span-3 flex items-center gap-4">
              {selectionCheckbox('Select all identities for export', results)}
              Identity
            </div>
            <div className="col-span-4">Recommended Role Combination</div>
            <div className="col-span-2 text-right">Coverage</div>
            <div className="col-span-3">Gap Analysis</div>
          </div>

          {IDENTITY_DISPLAY_GROUPS.map((group) => {
            const items = collectDisplayGroup(groupedResults, group);
            if (items.length === 0) return null;
            return (
              <React.Fragment key={group.label}>
                <div className="px-6 py-2 bg-neutral-100 dark:bg-neutral-900 border-y border-neutral-200 dark:border-neutral-700 font-semibold text-xs text-neutral-800 dark:text-neutral-300 uppercase tracking-wider sticky top-12 z-10 flex items-center gap-4">
                  {selectionCheckbox(`Select ${group.label} for export`, items)}
                  {ICON_BY_KIND[group.iconKind]}
                  {group.label} <span className="ml-1 opacity-60">({items.length})</span>
                </div>
                <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  {items.map((res) => {
                    const policyKey = getPolicyKey(res.originalPolicy);
                    return (
                      <IdentityResultCard
                        key={policyKey}
                        res={res}
                        resolvedNames={resolvedNames}
                        rowId={rowIds.get(res)!}
                        selectedIdx={selectedRecommendationIndex(res, selectedRoles)}
                        onSelectRole={onSelectRole && ((recIdx) => onSelectRole(policyKey, recIdx))}
                        selection={selection && {
                          checked: selection.selected.has(policyKey),
                          onToggle: () => toggleSelection([res]),
                        }}
                      />
                    );
                  })}
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
};
