import React, { useMemo } from 'react';
import { MigrationAnalysis, IdentityType } from '../../core/types';
import { UserIcon, GroupIcon, AppIcon, UnknownIcon, CompoundIdentityIcon } from '../icons';
import { Checkbox } from '../primitives/Checkbox';
import { getPolicyKey } from '../../core/identity/policyKey';
import { IdentityIconKind } from '../../core/identity/identity';
import {
  groupResultsByType,
  flattenInDisplayOrder,
  toCoverageChartData,
  collectDisplayGroup,
  IDENTITY_DISPLAY_GROUPS,
} from '../../core/identity/grouping';
import { CoverageChart } from './CoverageChart';
import { IdentityResultCard } from './IdentityResultCard';

const GROUP_ICON_BY_KIND: Record<IdentityIconKind, React.ReactNode> = {
  app: <AppIcon className="w-4 h-4" />,
  compound: <CompoundIdentityIcon className="w-4 h-4" />,
  group: <GroupIcon className="w-4 h-4" />,
  user: <UserIcon className="w-4 h-4" />,
  unknown: <UnknownIcon className="w-4 h-4" />,
};

interface AnalysisResultsProps {
  results: MigrationAnalysis[];
  selectedRoles: Record<string, number>;
  setSelectedRoles: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  resolvedNames: Record<string, { name: string; type: IdentityType }>;
  theme: 'light' | 'dark';
  selectedForExport: Set<string>;
  setSelectedForExport: React.Dispatch<React.SetStateAction<Set<string>>>;
}

export const AnalysisResults: React.FC<AnalysisResultsProps> = ({
  results,
  selectedRoles,
  setSelectedRoles,
  resolvedNames,
  theme,
  selectedForExport,
  setSelectedForExport,
}) => {

  const groupedResults = useMemo(
    () => groupResultsByType(results, resolvedNames),
    [results, resolvedNames]
  );

  const activeData = useMemo(
    () => toCoverageChartData(flattenInDisplayOrder(groupedResults), selectedRoles, resolvedNames),
    [groupedResults, selectedRoles, resolvedNames]
  );

  const [showSuggestions, setShowSuggestions] = React.useState<Record<string, boolean>>({});
  const [showCoverageDetails, setShowCoverageDetails] = React.useState<Record<string, boolean>>({});
  const [showPolicyDetails, setShowPolicyDetails] = React.useState<Record<string, boolean>>({});

  const toggleSuggestion = (id: string) => {
    setShowSuggestions((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleCoverageDetails = (id: string) => {
    setShowCoverageDetails((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const togglePolicyDetails = (id: string) => {
    setShowPolicyDetails((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Selection helpers
  const toggleItemSelection = (policyKey: string) => {
    setSelectedForExport((prev) => {
      const next = new Set(prev);
      if (next.has(policyKey)) {
        next.delete(policyKey);
      } else {
        next.add(policyKey);
      }
      return next;
    });
  };

  const toggleCategorySelection = (groupData: MigrationAnalysis[]) => {
    const ids = groupData.map((r) => getPolicyKey(r.originalPolicy));
    const allSelected = ids.every((id) => selectedForExport.has(id));

    setSelectedForExport((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        ids.forEach((id) => next.delete(id));
      } else {
        ids.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const toggleAllSelection = () => {
    const allIds = results.map((r) => getPolicyKey(r.originalPolicy));
    const allSelected = allIds.every((id) => selectedForExport.has(id));

    setSelectedForExport(() => {
      if (allSelected) {
        return new Set();
      } else {
        return new Set(allIds);
      }
    });
  };

  const getCategorySelectionState = (groupData: MigrationAnalysis[]): 'all' | 'some' | 'none' => {
    const ids = groupData.map((r) => getPolicyKey(r.originalPolicy));
    const selectedCount = ids.filter((id) => selectedForExport.has(id)).length;
    if (selectedCount === 0) return 'none';
    if (selectedCount === ids.length) return 'all';
    return 'some';
  };

  const getAllSelectionState = (): 'all' | 'some' | 'none' => getCategorySelectionState(results);

  const renderIdentityGroup = (title: string, groupData: MigrationAnalysis[], icon: React.ReactNode) => {
    if (groupData.length === 0) return null;
    const selectionState = getCategorySelectionState(groupData);

    return (
      <React.Fragment>
        <div className="px-6 py-2 bg-neutral-100 dark:bg-neutral-900 border-y border-neutral-200 dark:border-neutral-700 font-semibold text-xs text-neutral-800 dark:text-neutral-300 uppercase tracking-wider sticky top-12 z-10 flex items-center gap-4">
          <Checkbox
            checked={selectionState === 'all'}
            indeterminate={selectionState === 'some'}
            onChange={() => toggleCategorySelection(groupData)}
          />
          {icon}
          {title} <span className="ml-1 opacity-60">({groupData.length})</span>
        </div>
        <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {groupData.map((res) => {
            const policyKey = getPolicyKey(res.originalPolicy);
            return (
              <IdentityResultCard
                key={policyKey}
                res={res}
                resolvedNames={resolvedNames}
                selectedRoleIdx={selectedRoles[policyKey] || 0}
                onSelectRole={(recIdx) => setSelectedRoles((prev) => ({ ...prev, [policyKey]: recIdx }))}
                isSelected={selectedForExport.has(policyKey)}
                onToggleSelection={() => toggleItemSelection(policyKey)}
                showSuggestions={!!showSuggestions[policyKey]}
                onToggleSuggestions={() => toggleSuggestion(policyKey)}
                showCoverageDetails={!!showCoverageDetails[policyKey]}
                onToggleCoverageDetails={() => toggleCoverageDetails(policyKey)}
                showPolicyDetails={!!showPolicyDetails[policyKey]}
                onTogglePolicyDetails={() => togglePolicyDetails(policyKey)}
              />
            );
          })}
        </div>
      </React.Fragment>
    );
  };

  return (
    <div className="space-y-8 fade-in-up">

      {/* Overview Charts */}
      <CoverageChart data={activeData} theme={theme} />

      {/* Detailed List */}
      <div>
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-4">Identity Mapping</h3>
        <div className="border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-800 overflow-clip">
          <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-neutral-50 dark:bg-neutral-900/50 border-b border-neutral-200 dark:border-neutral-700 text-xs font-semibold text-neutral-700 dark:text-neutral-400 uppercase tracking-wider">
            <div className="col-span-3 flex items-center gap-4">
              <Checkbox
                checked={getAllSelectionState() === 'all'}
                indeterminate={getAllSelectionState() === 'some'}
                onChange={toggleAllSelection}
              />
              Identity
            </div>
            <div className="col-span-4">Recommended Role Combination</div>
            <div className="col-span-2 text-right">Coverage</div>
            <div className="col-span-3">Gap Analysis</div>
          </div>

          {/* Render identity sections in the shared display order */}
          {IDENTITY_DISPLAY_GROUPS.map((group) => (
            <React.Fragment key={group.label}>
              {renderIdentityGroup(
                group.label,
                collectDisplayGroup(groupedResults, group),
                GROUP_ICON_BY_KIND[group.iconKind]
              )}
            </React.Fragment>
          ))}

        </div>
      </div>

    </div>
  );
};
