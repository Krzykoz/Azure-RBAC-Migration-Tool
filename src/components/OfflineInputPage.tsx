import React, { useState } from 'react';
import { KeyVault, RoleDefinition } from '../types';
import {
    parseKeyVaultResponse,
    KeyVaultResponse,
} from '../services/azureResponseParser';
import { ArrowLeftIcon, CheckCircleIcon } from './Icons';
import { CopyableCommand } from './ui';

interface OfflineInputPageProps {
    onStart: (vaults: KeyVault[], roles: RoleDefinition[]) => void;
    onBack: () => void;
    theme: 'light' | 'dark';
}

export const OfflineInputPage: React.FC<OfflineInputPageProps> = ({
    onStart,
    onBack,
    theme,
}) => {
    const [vaultJson, setVaultJson] = useState('');
    const [roleJson, setRoleJson] = useState('');
    const [error, setError] = useState<string | null>(null);

    const handleStart = () => {
        setError(null);

        try {
            if (!vaultJson.trim() || !roleJson.trim()) {
                throw new Error('Both Vault Data and Role Data are required.');
            }

            const parsedVaultsRaw = JSON.parse(vaultJson);
            const parsedRolesRaw = JSON.parse(roleJson);

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
            let roleListRaw: any[] = [];
            if (Array.isArray(parsedRolesRaw)) {
                roleListRaw = parsedRolesRaw;
            } else if (parsedRolesRaw.value && Array.isArray(parsedRolesRaw.value)) {
                roleListRaw = parsedRolesRaw.value;
            } else if (
                parsedRolesRaw.roleName ||
                (parsedRolesRaw.properties && parsedRolesRaw.id)
            ) {
                roleListRaw = [parsedRolesRaw];
            }

            if (!vaultList || vaultList.length === 0) {
                throw new Error(
                    'No valid Key Vault data found. Ensure it is an Access Policy, List of Policies, or Key Vault object(s).'
                );
            }
            if (!roleListRaw || roleListRaw.length === 0) {
                throw new Error('No valid Role Definitions found in JSON.');
            }

            // Normalize roles (handle both CLI flat format and ARM nested format)
            const roleList: RoleDefinition[] = roleListRaw.map((r: any) => {
                if (r.properties) return r as RoleDefinition;
                return {
                    id: r.id,
                    name: r.name,
                    type: r.type,
                    properties: {
                        roleName: r.roleName,
                        description: r.description,
                        type: r.roleType,
                        permissions: r.permissions,
                        assignableScopes: r.assignableScopes,
                    },
                } as RoleDefinition;
            });

            const vaults = vaultList.map((v) => parseKeyVaultResponse(v, {}));
            onStart(vaults, roleList);
        } catch (e: any) {
            console.error(e);
            setError('Invalid JSON: ' + e.message);
        }
    };

    const vaultCommand =
        'az keyvault show --name <vault-name> --resource-group <resource-group> --query properties.accessPolicies -o json';
    const roleCommand = `az role definition list -o json --query "[?contains(join(',', permissions[].dataActions[]), 'Microsoft.KeyVault')]"`;

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-neutral-100 dark:bg-neutral-900">
            <div className="max-w-4xl w-full bg-white dark:bg-neutral-800 shadow-fluent p-8 rounded-lg border border-neutral-200 dark:border-neutral-700 my-8 flex flex-col max-h-[90vh]">
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
                            Offline Mode
                        </h2>
                        <p className="text-neutral-600 dark:text-neutral-400 text-sm">
                            Manually provide JSON data to run analysis without connecting to Azure.
                        </p>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto space-y-6 pr-2">
                    {/* Vault Input */}
                    <div>
                        <label className="block text-sm font-bold text-neutral-800 dark:text-neutral-200 mb-1.5">
                            1. Access Policies JSON <span className="text-red-500">*</span>
                        </label>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
                            Run this command for a specific Key Vault:
                        </p>
                        <CopyableCommand command={vaultCommand} commandId="vault" />
                        <textarea
                            value={vaultJson}
                            onChange={(e) => setVaultJson(e.target.value)}
                            placeholder="Paste Access Policies JSON here..."
                            className="w-full h-48 p-3 font-mono text-xs rounded-sm bg-neutral-50 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 focus:border-brand-600 focus:ring-1 focus:ring-brand-600 outline-none resize-y"
                        />
                    </div>

                    {/* Role Input */}
                    <div>
                        <label className="block text-sm font-bold text-neutral-800 dark:text-neutral-200 mb-1.5">
                            2. Role Definitions JSON <span className="text-red-500">*</span>
                        </label>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
                            Run this command to get available RBAC roles:
                        </p>
                        <CopyableCommand command={roleCommand} commandId="role" />
                        <textarea
                            value={roleJson}
                            onChange={(e) => setRoleJson(e.target.value)}
                            placeholder="Paste Role Definitions JSON here..."
                            className="w-full h-48 p-3 font-mono text-xs rounded-sm bg-neutral-50 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 focus:border-brand-600 focus:ring-1 focus:ring-brand-600 outline-none resize-y"
                        />
                    </div>

                    {error && (
                        <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 text-sm font-medium border border-red-200 dark:border-red-900 rounded">
                            {error}
                        </div>
                    )}
                </div>

                <div className="pt-6 mt-4 border-t border-neutral-200 dark:border-neutral-700 flex justify-end">
                    <button
                        onClick={handleStart}
                        className="bg-brand-600 hover:bg-brand-700 text-white font-semibold py-2 px-6 rounded-sm transition-colors flex items-center gap-2 shadow-sm"
                    >
                        <CheckCircleIcon className="w-4 h-4" /> Analyze
                    </button>
                </div>
            </div>
        </div>
    );
};

// Helper function to create an offline vault wrapper
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
