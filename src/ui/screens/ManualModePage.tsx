import React, { useMemo, useState } from 'react';
import { AccessPolicyEntry, MigrationAnalysis } from '../../core/types';
import { LEGACY_KEY_VAULT_PERMISSIONS } from '../../core/permissions/legacy';
import { analyzePolicies } from '../../core/analysis/engine';
import { ArrowLeftIcon, ShieldCheckIcon } from '../icons';
import {
  CATEGORY_ORDER,
  Category,
  CategorySelection,
  emptySelection,
} from '../../core/permissions/categories';
import { useManualRoles } from '../hooks/useManualRoles';
import { RoleSourceSelector } from '../components/RoleSourceSelector';
import { PermissionPicker } from '../components/PermissionPicker';
import { EmptyHint, ManualResults } from '../components/ManualResults';

interface ManualModePageProps {
  onBack: () => void;
}

export const ManualModePage: React.FC<ManualModePageProps> = ({ onBack }) => {
  const [selected, setSelected] = useState<CategorySelection>(emptySelection);
  const roles = useManualRoles();
  const { activeRoles, roleSource } = roles;

  const totalSelected = useMemo(
    () => CATEGORY_ORDER.reduce((sum, cat) => sum + selected[cat].size, 0),
    [selected]
  );

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

        <RoleSourceSelector
          roleSource={roles.roleSource}
          onSelectSource={roles.setRoleSource}
          sourceStatus={roles.sourceStatus}
          pasteJson={roles.pasteJson}
          onChangePasteJson={roles.setPasteJson}
          pasteError={roles.pasteError}
          token={roles.token}
          onChangeToken={roles.setToken}
          subscriptions={roles.subscriptions}
          selectedSubId={roles.selectedSubId}
          onSelectSubscription={roles.selectSubscription}
          loadingSubs={roles.loadingSubs}
          loadingRoles={roles.loadingRoles}
          tokenError={roles.tokenError}
          onLoadSubscriptions={roles.loadSubscriptions}
          onLoadRoles={roles.loadRoles}
        />

        {/* Permissions: full width */}
        <PermissionPicker
          selected={selected}
          totalSelected={totalSelected}
          onTogglePermission={togglePermission}
          onToggleCategoryAll={toggleCategoryAll}
          onClearAll={clearAll}
        />

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
