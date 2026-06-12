import { RoleDefinition, AccessPolicyEntry, RoleAssignment } from '../core/types';

/**
 * Test factories for building Azure domain objects with sensible defaults.
 * Kept outside any *.test.ts file so Vitest does not treat it as a suite.
 */

export const makeRole = (
  roleName: string,
  dataActions: string[],
  opts: {
    name?: string;
    notDataActions?: string[];
    type?: string;
    actions?: string[];
  } = {}
): RoleDefinition => ({
  id: `/providers/Microsoft.Authorization/roleDefinitions/${opts.name ?? roleName}`,
  name: opts.name ?? roleName,
  type: 'Microsoft.Authorization/roleDefinitions',
  properties: {
    roleName,
    description: '',
    type: opts.type ?? 'BuiltInRole',
    permissions: [
      {
        actions: opts.actions ?? [],
        notActions: [],
        dataActions,
        notDataActions: opts.notDataActions ?? [],
      },
    ],
    assignableScopes: ['/'],
  },
});

export const makePolicy = (
  permissions: AccessPolicyEntry['permissions'],
  opts: Partial<AccessPolicyEntry> = {}
): AccessPolicyEntry => ({
  tenantId: opts.tenantId ?? 'tenant-1',
  objectId: opts.objectId ?? 'obj-1',
  applicationId: opts.applicationId,
  displayName: opts.displayName,
  type: opts.type ?? 'Unknown',
  permissions,
});

export const makeAssignment = (
  principalId: string,
  roleDefinitionId: string,
  scope: string
): RoleAssignment => ({
  id: `/ra/${principalId}/${scope}`,
  name: 'ra',
  type: 'Microsoft.Authorization/roleAssignments',
  properties: {
    roleDefinitionId,
    principalId,
    principalType: 'User',
    scope,
  },
});

// Canonical RBAC data actions used across tests (must match accessPolicyRbacMapping.csv).
export const ACTIONS = {
  SECRET_GET: 'Microsoft.KeyVault/vaults/secrets/getSecret/action',
  SECRET_LIST: 'Microsoft.KeyVault/vaults/secrets/readMetadata/action',
  SECRET_SET: 'Microsoft.KeyVault/vaults/secrets/setSecret/action',
  SECRET_UPDATE: 'Microsoft.KeyVault/vaults/secrets/update/action',
  SECRET_DELETE: 'Microsoft.KeyVault/vaults/secrets/delete',
  SECRET_PURGE: 'Microsoft.KeyVault/vaults/secrets/purge/action',
  KEY_READ: 'Microsoft.KeyVault/vaults/keys/read',
  SECRETS_WILDCARD: 'Microsoft.KeyVault/vaults/secrets/*',
  VAULT_WILDCARD: 'Microsoft.KeyVault/vaults/*',
} as const;
