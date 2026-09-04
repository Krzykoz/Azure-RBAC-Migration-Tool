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
    applicationId?: string | null;
    displayName?: string | null;
    permissions?: Record<string, string[] | null>;
  }>;
}

export interface KeyVaultResponse {
  id: string;
  name: string;
  location: string;
  properties: KeyVaultProperties;
}

const requireObject = (value: unknown, field: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${field} must be an object.`);
  }
  return value as Record<string, unknown>;
};

const requireString = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${field} must be a nonempty string.`);
  }
  return value;
};

export const parseKeyVaultResponse = (
  input: unknown,
  principalTypeCache: Record<string, IdentityType>
): KeyVault => {
  const vaultData = requireObject(input, 'Key Vault');
  const id = requireString(vaultData.id, 'Key Vault id');
  const name = requireString(vaultData.name, 'Key Vault name');
  const location = requireString(vaultData.location, `Key Vault "${name}" location`);
  const properties = requireObject(vaultData.properties, `Key Vault "${name}" properties`);
  const sku = properties.sku === undefined
    ? 'Unknown'
    : requireString(requireObject(properties.sku, 'Key Vault sku').name, 'Key Vault sku.name');
  const policies = properties.accessPolicies === undefined ? [] : properties.accessPolicies;
  if (!Array.isArray(policies)) {
    throw new Error(`Key Vault "${name}" accessPolicies must be an array.`);
  }

  return {
    id,
    name,
    location,
    sku,
    accessPolicies: policies.map((policy: unknown, index) => {
      const field = `Key Vault "${name}" accessPolicies[${index}]`;
      const ap = requireObject(policy, field);
      const tenantId = requireString(ap.tenantId, `${field}.tenantId`);
      const objectId = requireString(ap.objectId, `${field}.objectId`);
      const applicationId = ap.applicationId == null
        ? undefined
        : requireString(ap.applicationId, `${field}.applicationId`);
      const displayName = ap.displayName == null
        ? undefined
        : requireString(ap.displayName, `${field}.displayName`);
      let type: IdentityType = 'Unknown';

      // 1. Infer from Access Policy data (if applicationId is present, it's an app/SP)
      if (applicationId) {
        type = 'Application';
      }
      // 2. Infer from Role Assignment Cache (high hit rate for users/groups)
      else if (Object.hasOwn(principalTypeCache, objectId)) {
        type = principalTypeCache[objectId];
      }

      // Note: ap.displayName might not exist in standard ARM response,
      // but we check for it just in case the API version or proxy adds it.

      const rawPermissions = requireObject(ap.permissions, `${field}.permissions`);
      const expandedPermissions: Record<string, string[]> = {};

      // Expand "all" to full list (minus Purge) here at the parsing level
      Object.entries(rawPermissions).forEach(([category, perms]) => {
        const normalizedCategory = category.toLowerCase();
        if (!Object.hasOwn(LEGACY_KEY_VAULT_PERMISSIONS, normalizedCategory)) {
          throw new Error(`${field}.permissions has an unknown category "${category}".`);
        }
        if (perms === null) return;
        if (!Array.isArray(perms) || perms.some((p) => typeof p !== 'string' || !p.trim())) {
          throw new Error(`${field}.permissions.${category} must be an array of nonempty strings.`);
        }

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
        tenantId,
        objectId,
        applicationId,
        displayName,
        type: type,
        permissions: expandedPermissions,
      };
    }),
  };
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
