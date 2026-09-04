import React, { useState } from 'react';
import { KeyVault, RoleDefinition } from '../../core/types';
import { parseKeyVaultResponse, KeyVaultResponse } from '../../azure/parsers';
import { normalizeRoleDefinitions } from '../../core/roles/normalization';
import { defaultPermissionCatalog } from '../../core/analysis/permissionCatalog';
import { parseVaultResourceId } from '../../core/export/tabular';
import { ArrowLeftIcon, CheckCircleIcon } from '../icons';
import { CopyableCommand } from '../primitives/CopyableCommand';

interface OfflineInputPageProps {
  onStart: (vaults: KeyVault[], roles: RoleDefinition[]) => void;
  onBack: () => void;
}

export const OfflineInputPage: React.FC<OfflineInputPageProps> = ({
  onStart,
  onBack,
}) => {
  const [vaultJson, setVaultJson] = useState('');
  const [roleJson, setRoleJson] = useState('');
  const [targetResourceId, setTargetResourceId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleStart = () => {
    setError(null);

    try {
      if (!vaultJson.trim() || !roleJson.trim()) {
        throw new Error('Both Vault Data and Role Data are required.');
      }

      const parsedVaultsRaw = JSON.parse(vaultJson);
      const parsedRolesRaw = JSON.parse(roleJson);
      const target = targetResourceId.trim();
      if (target) parseVaultResourceId(target);

      let vaultList: KeyVaultResponse[] = [];

      // Handle different input formats for vaults
      if (
        !Array.isArray(parsedVaultsRaw) &&
        parsedVaultsRaw.permissions &&
        parsedVaultsRaw.objectId
      ) {
        // Single Access Policy Object
        vaultList = [createOfflineVault([parsedVaultsRaw], target)];
      } else if (
        Array.isArray(parsedVaultsRaw) &&
        parsedVaultsRaw.length > 0 &&
        parsedVaultsRaw[0].permissions &&
        parsedVaultsRaw[0].objectId
      ) {
        // List of Access Policies
        vaultList = [createOfflineVault(parsedVaultsRaw, target)];
      } else if (parsedVaultsRaw.value && Array.isArray(parsedVaultsRaw.value)) {
        // Standard Key Vault List Response
        vaultList = parsedVaultsRaw.value;
      } else if (parsedVaultsRaw.id && parsedVaultsRaw.properties) {
        // Single Key Vault Response
        vaultList = [parsedVaultsRaw];
      } else if (
        Array.isArray(parsedVaultsRaw) &&
        parsedVaultsRaw.length > 0 &&
        parsedVaultsRaw[0].id
      ) {
        // Direct array of Key Vaults
        vaultList = parsedVaultsRaw;
      } else {
        vaultList = Array.isArray(parsedVaultsRaw)
          ? parsedVaultsRaw
          : parsedVaultsRaw.value || [];
      }

      if (!vaultList || vaultList.length === 0) {
        throw new Error(
          'No valid Key Vault data found. Ensure it is an Access Policy, List of Policies, or Key Vault object(s).'
        );
      }

      // Normalize roles (handles CLI flat format, ARM nested format, and envelopes)
      const roleList = normalizeRoleDefinitions(parsedRolesRaw);
      if (roleList.length === 0) {
        throw new Error('No valid Role Definitions found in JSON.');
      }

      const vaults = vaultList.map((v) => parseKeyVaultResponse(v, {}));
      vaults.forEach((vault) => vault.accessPolicies.forEach((policy) => defaultPermissionCatalog.getRequiredActions(policy)));
      onStart(vaults, roleList);
    } catch (e: unknown) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'Unable to read the supplied data.');
    }
  };

  const vaultCommand =
    'az keyvault show --name <vault-name> --resource-group <resource-group> --query properties.accessPolicies -o json';
  const roleCommand = `az role definition list -o json --query "[?contains(join(',', permissions[].dataActions[]), 'Microsoft.KeyVault')]"`;

  return (
    <div className="min-h-[calc(100svh-3rem)] flex items-start justify-center p-3 bg-neutral-100 dark:bg-neutral-900 sm:items-center sm:p-4">
      <div className="my-4 w-full max-w-4xl rounded-lg border border-neutral-200 bg-white p-4 shadow-fluent dark:border-neutral-700 dark:bg-neutral-800 sm:my-8 sm:p-8">
        <div className="flex items-start gap-3 mb-6 sm:items-center sm:gap-4">
          <button
            onClick={onBack}
            className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-full transition-colors"
            aria-label="Back"
          >
            <ArrowLeftIcon className="w-5 h-5 text-neutral-600 dark:text-neutral-400" />
          </button>
          <div>
            <h2 className="text-2xl font-semibold text-neutral-900 dark:text-white">
              Offline Mode
            </h2>
            <p className="text-neutral-600 dark:text-neutral-400 text-sm">
              Manually provide JSON data to run analysis without connecting to Azure.
            </p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Vault Input */}
          <div>
            <label htmlFor="offline-policies" className="block text-sm font-bold text-neutral-800 dark:text-neutral-200 mb-1.5">
              1. Access Policies JSON <span className="text-red-500">*</span>
            </label>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
              Run this command for a specific Key Vault:
            </p>
            <CopyableCommand command={vaultCommand} commandId="vault" />
            <textarea
              id="offline-policies"
              value={vaultJson}
              onChange={(e) => setVaultJson(e.target.value)}
              placeholder="Paste Access Policies JSON here..."
              className="w-full h-36 p-3 font-mono text-xs rounded-sm bg-neutral-50 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 focus:border-brand-600 focus:ring-1 focus:ring-brand-600 outline-none resize-y sm:h-48"
            />
          </div>

          {/* Role Input */}
          <div>
            <label htmlFor="offline-roles" className="block text-sm font-bold text-neutral-800 dark:text-neutral-200 mb-1.5">
              2. Role Definitions JSON <span className="text-red-500">*</span>
            </label>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
              Run this command to get available RBAC roles:
            </p>
            <CopyableCommand command={roleCommand} commandId="role" />
            <textarea
              id="offline-roles"
              value={roleJson}
              onChange={(e) => setRoleJson(e.target.value)}
              placeholder="Paste Role Definitions JSON here..."
              className="w-full h-36 p-3 font-mono text-xs rounded-sm bg-neutral-50 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 focus:border-brand-600 focus:ring-1 focus:ring-brand-600 outline-none resize-y sm:h-48"
            />
          </div>

          <div>
            <label htmlFor="offline-target" className="block text-sm font-bold text-neutral-800 dark:text-neutral-200 mb-1.5">
              Target vault resource ID (optional)
            </label>
            <input
              id="offline-target"
              value={targetResourceId}
              onChange={(event) => setTargetResourceId(event.target.value)}
              placeholder="/subscriptions/<guid>/resourceGroups/<group>/providers/Microsoft.KeyVault/vaults/<name>"
              className="w-full p-3 font-mono text-xs rounded-sm bg-neutral-50 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 focus:ring-1 focus:ring-brand-600"
              aria-describedby="offline-target-help"
            />
            <p id="offline-target-help" className="mt-2 text-xs text-neutral-700 dark:text-neutral-300">
              For policy-only input, provide the real vault ID to enable PowerShell export.
              Analysis and data reports work without it. Full vault JSON already includes its target.
            </p>
          </div>

          {error && (
            <div role="alert" className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 text-sm font-medium border border-red-200 dark:border-red-900 rounded">
              {error}
            </div>
          )}
        </div>

        <div className="pt-6 mt-4 border-t border-neutral-200 dark:border-neutral-700 flex justify-end">
          <button
            onClick={handleStart}
            className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold py-2 px-6 rounded-sm transition-colors flex items-center justify-center gap-2 shadow-sm sm:w-auto"
          >
            <CheckCircleIcon className="w-4 h-4" /> Analyze
          </button>
        </div>
      </div>
    </div>
  );
};

// Wraps standalone access policies in a synthetic vault so the normal
// analysis pipeline can consume them.
function createOfflineVault(
  accessPolicies: NonNullable<KeyVaultResponse['properties']['accessPolicies']>,
  resourceId: string
): KeyVaultResponse {
  return {
    id: resourceId || '/subscriptions/offline-sub/resourceGroups/offline-rg/providers/Microsoft.KeyVault/vaults/Offline-Vault-Input',
    name: resourceId ? parseVaultResourceId(resourceId).vaultName : 'Offline-Vault-Input',
    location: 'unknown',
    properties: {
      sku: { name: 'standard' },
      accessPolicies,
    },
  };
}
