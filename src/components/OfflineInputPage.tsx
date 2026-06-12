import { createSignal, Show, type JSX } from 'solid-js';
import { KeyVault, RoleDefinition } from '../types';
import { parseKeyVaultResponse, KeyVaultResponse } from '../services/azureResponseParser';
import { normalizeRoleDefinitions } from '../utils/roleNormalization';
import { ArrowLeftIcon, CheckCircleIcon } from './Icons';
import { CopyableCommand } from './ui';

interface OfflineInputPageProps {
    onStart: (vaults: KeyVault[], roles: RoleDefinition[]) => void;
    onBack: () => void;
    theme: 'light' | 'dark';
}

// Wrap raw access policies in a synthetic Key Vault so policy-only input still analyzes.
function createOfflineVault(accessPolicies: any[]): KeyVaultResponse {
    return {
        id: '/subscriptions/offline-sub/resourceGroups/offline-rg/providers/Microsoft.KeyVault/vaults/Offline-Vault-Input',
        name: 'Offline-Vault-Input',
        location: 'unknown',
        properties: {
            sku: { name: 'standard' },
            accessPolicies,
        },
    };
}

export const OfflineInputPage = (props: OfflineInputPageProps): JSX.Element => {
    const [vaultJson, setVaultJson] = createSignal('');
    const [roleJson, setRoleJson] = createSignal('');
    const [error, setError] = createSignal<string | null>(null);

    const handleStart = () => {
        setError(null);

        try {
            if (!vaultJson().trim() || !roleJson().trim()) {
                throw new Error('Both Vault Data and Role Data are required.');
            }

            const parsedVaultsRaw = JSON.parse(vaultJson());
            const parsedRolesRaw = JSON.parse(roleJson());

            let vaultList: KeyVaultResponse[] = [];

            // Handle different input formats for vaults
            if (
                !Array.isArray(parsedVaultsRaw) &&
                parsedVaultsRaw.permissions &&
                parsedVaultsRaw.objectId
            ) {
                // Single Access Policy Object
                vaultList = [createOfflineVault([parsedVaultsRaw])];
            } else if (
                Array.isArray(parsedVaultsRaw) &&
                parsedVaultsRaw.length > 0 &&
                parsedVaultsRaw[0].permissions &&
                parsedVaultsRaw[0].objectId
            ) {
                // List of Access Policies
                vaultList = [createOfflineVault(parsedVaultsRaw)];
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

            // Handle different input formats for roles
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
            props.onStart(vaults, roleList);
        } catch (e: any) {
            console.error(e);
            setError('Invalid JSON: ' + e.message);
        }
    };

    const vaultCommand =
        'az keyvault show --name <vault-name> --resource-group <resource-group> --query properties.accessPolicies -o json';
    const roleCommand = `az role definition list -o json --query "[?contains(join(',', permissions[].dataActions[]), 'Microsoft.KeyVault')]"`;

    return (
        <div class="min-h-screen flex items-center justify-center p-4 bg-neutral-100 dark:bg-neutral-900">
            <div class="max-w-4xl w-full bg-white dark:bg-neutral-800 shadow-fluent p-8 rounded-lg border border-neutral-200 dark:border-neutral-700 my-8 flex flex-col max-h-[90vh]">
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
                            Offline Mode
                        </h2>
                        <p class="text-neutral-600 dark:text-neutral-400 text-sm">
                            Manually provide JSON data to run analysis without connecting to Azure.
                        </p>
                    </div>
                </div>

                <div class="flex-1 overflow-y-auto space-y-6 pr-2">
                    {/* Vault Input */}
                    <div>
                        <label class="block text-sm font-bold text-neutral-800 dark:text-neutral-200 mb-1.5">
                            1. Access Policies JSON <span class="text-red-500">*</span>
                        </label>
                        <p class="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
                            Run this command for a specific Key Vault:
                        </p>
                        <CopyableCommand command={vaultCommand} commandId="vault" />
                        <textarea
                            value={vaultJson()}
                            onInput={(e) => setVaultJson(e.currentTarget.value)}
                            placeholder="Paste Access Policies JSON here..."
                            class="w-full h-48 p-3 font-mono text-xs rounded-sm bg-neutral-50 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 focus:border-brand-600 focus:ring-1 focus:ring-brand-600 outline-none resize-y"
                        />
                    </div>

                    {/* Role Input */}
                    <div>
                        <label class="block text-sm font-bold text-neutral-800 dark:text-neutral-200 mb-1.5">
                            2. Role Definitions JSON <span class="text-red-500">*</span>
                        </label>
                        <p class="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
                            Run this command to get available RBAC roles:
                        </p>
                        <CopyableCommand command={roleCommand} commandId="role" />
                        <textarea
                            value={roleJson()}
                            onInput={(e) => setRoleJson(e.currentTarget.value)}
                            placeholder="Paste Role Definitions JSON here..."
                            class="w-full h-48 p-3 font-mono text-xs rounded-sm bg-neutral-50 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 focus:border-brand-600 focus:ring-1 focus:ring-brand-600 outline-none resize-y"
                        />
                    </div>

                    <Show when={error()}>
                        <div class="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 text-sm font-medium border border-red-200 dark:border-red-900 rounded">
                            {error()}
                        </div>
                    </Show>
                </div>

                <div class="pt-6 mt-4 border-t border-neutral-200 dark:border-neutral-700 flex justify-end">
                    <button
                        onClick={() => handleStart()}
                        class="bg-brand-600 hover:bg-brand-700 text-white font-semibold py-2 px-6 rounded-sm transition-colors flex items-center gap-2 shadow-sm"
                    >
                        <CheckCircleIcon class="w-4 h-4" /> Analyze
                    </button>
                </div>
            </div>
        </div>
    );
};
