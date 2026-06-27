import { Subscription, KeyVault, IdentityType } from '../core/types';
import { KEY_VAULT_ALL_PERMISSIONS, LEGACY_KEY_VAULT_PERMISSIONS } from '../core/permissions/legacy';

/**
 * Pure parsers from raw ARM/Graph response shapes into the app's domain types.
 * Kept free of fetch logic so they can be tested with plain fixtures.
 */

interface KeyVaultProperties {
  sku?: { name: string };
  accessPolicies?: Array<{
    tenantId: string;
    objectId: string;
    applicationId?: string;
    displayName?: string;
    permissions?: Record<string, string[]>;
  }>;
}

export interface KeyVaultResponse {
  id: string;
  name: string;
  location: string;
  properties: KeyVaultProperties;
}

export const parseKeyVaultResponse = (
  vaultData: KeyVaultResponse,
  principalTypeCache: Record<string, IdentityType>
): KeyVault => {
  return {
    id: vaultData.id,
    name: vaultData.name,
    location: vaultData.location,
    sku: vaultData.properties.sku?.name || 'Unknown',
    accessPolicies: (vaultData.properties.accessPolicies || []).map((ap) => {
      let type: IdentityType = 'Unknown';

      // 1. Infer from Access Policy data (if applicationId is present, it's an app/SP)
      if (ap.applicationId) {
        type = 'Application';
      }
      // 2. Infer from Role Assignment Cache (high hit rate for users/groups)
      else if (principalTypeCache[ap.objectId]) {
        type = principalTypeCache[ap.objectId];
      }

      // Note: ap.displayName might not exist in standard ARM response,
      // but we check for it just in case the API version or proxy adds it.

      const rawPermissions = ap.permissions || {};
      const expandedPermissions: Record<string, string[]> = {};

      // Expand "all" to full list (minus Purge) here at the parsing level
      Object.entries(rawPermissions).forEach(([category, perms]) => {
        const normalizedCategory = category.toLowerCase();
        if (!perms) return;

        // Helper to find standard casing if possible
        const canonicalPerms = LEGACY_KEY_VAULT_PERMISSIONS[normalizedCategory] || [];
        const getNiceCasing = (p: string) => {
          if (p.toLowerCase() === 'all') return 'All';
          // Prefer the canonical casing from the legacy catalog so multi-word
          // permissions (e.g. "ManageContacts") aren't flattened to "Managecontacts".
          const match = canonicalPerms.find((c) => c.toLowerCase() === p.toLowerCase());
          if (match) return match;
          return p.charAt(0).toUpperCase() + p.slice(1);
        };

        if (perms.some((p) => p.toLowerCase() === 'all')) {
          const standardPerms = KEY_VAULT_ALL_PERMISSIONS[normalizedCategory] || [];

          // Get other permissions (like 'purge'), and try to normalize their casing
          const otherPerms = perms
            .filter((p) => p.toLowerCase() !== 'all')
            .map((p) => getNiceCasing(p));

          expandedPermissions[category] = Array.from(new Set([...standardPerms, ...otherPerms]));
        } else {
          expandedPermissions[category] = perms;
        }
      });

      return {
        tenantId: ap.tenantId,
        objectId: ap.objectId,
        applicationId: ap.applicationId,
        displayName: ap.displayName || undefined,
        type: type,
        permissions: expandedPermissions,
      };
    }),
  } as KeyVault;
};

export interface SubscriptionResponse {
  value: Array<{
    id: string;
    displayName: string;
    subscriptionId: string;
  }>;
}

export const parseSubscriptions = (data: SubscriptionResponse): Subscription[] => {
  return data.value.map((sub) => ({
    id: sub.id,
    displayName: sub.displayName,
    subscriptionId: sub.subscriptionId,
  }));
};

export interface TenantResponse {
  value: Array<{
    id: string;
    tenantId: string;
    displayName: string;
  }>;
}

export const parseTenants = (data: TenantResponse): Record<string, string> =>
  Object.fromEntries(data.value.map((t) => [t.tenantId, t.displayName]));

export interface RoleAssignmentResponse {
  value: Array<{
    properties: {
      principalId: string;
      principalType: string;
      roleDefinitionId?: string; // Optional for type cache
    };
  }>;
}

export const parsePrincipalTypes = (data: RoleAssignmentResponse): Record<string, IdentityType> => {
  const cache: Record<string, IdentityType> = {};
  if (data && data.value) {
    data.value.forEach((assignment) => {
      const pid = assignment.properties.principalId;
      const pType = assignment.properties.principalType; // 'User', 'Group', 'ServicePrincipal'
      if (pid && pType) {
        cache[pid] = pType as IdentityType;
      }
    });
  }
  return cache;
};

interface GraphObject {
  id: string;
  displayName?: string;
  appDisplayName?: string;
  userPrincipalName?: string;
  mailNickname?: string;
  '@odata.type': string;
}

export interface GraphResponse {
  value: GraphObject[];
}

export const parseGraphResponse = (data: GraphResponse): Record<string, { name: string; type: IdentityType }> => {
  const map: Record<string, { name: string; type: IdentityType }> = {};
  data.value.forEach((item) => {
    // 1. Determine Name
    const name = item.displayName || item.appDisplayName || item.userPrincipalName || item.mailNickname;

    // 2. Determine Type from OData Metadata
    let type: IdentityType = 'Unknown';
    const odataType = item['@odata.type']; // e.g., "#microsoft.graph.user"

    if (odataType === '#microsoft.graph.user') type = 'User';
    else if (odataType === '#microsoft.graph.group') type = 'Group';
    else if (odataType === '#microsoft.graph.servicePrincipal') type = 'ServicePrincipal';
    else if (odataType === '#microsoft.graph.application') type = 'Application';

    if (name) {
      map[item.id] = { name, type };
    }
  });
  return map;
};
