import { Subscription, KeyVault, RoleDefinition, IdentityType, RoleAssignment } from '../types';
import {
  KeyVaultResponse,
  SubscriptionResponse,
  TenantResponse,
  RoleDefinitionResponse,
  RoleAssignmentResponse,
  GraphResponse,
  parseKeyVaultResponse,
  parseSubscriptions,
  parseTenants,
  parseRoleDefinitions,
  parsePrincipalTypes,
  parseRoleAssignments,
  parseGraphResponse
} from './azureResponseParser';
import { AZURE_API_VERSIONS, AZURE_ENDPOINTS, ANALYSIS_CONSTANTS } from '../constants';

const { ARM, GRAPH } = AZURE_ENDPOINTS;
const API = AZURE_API_VERSIONS;

export class AzureError extends Error {
  constructor(message: string, public readonly originalError?: unknown) {
    super(message);
    this.name = 'AzureError';
  }
}

// Helper for fetch calls
const azureFetch = async <T>(url: string, token: string): Promise<T> => {
  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new AzureError(`Azure API Error ${response.status}: ${errorText}`);
    }

    return await response.json() as T;
  } catch (e) {
    if (e instanceof AzureError) throw e;
    throw new AzureError('Network or Fetch Error', e);
  }
};

interface PagedListResponse<TItem> {
  value?: TItem[];
  nextLink?: string;
}

// ARM list endpoints return at most one page of results plus an absolute `nextLink` URL.
// This helper follows nextLink until exhausted so large subscriptions are not silently truncated.
const azureFetchAllPages = async <TItem>(url: string, token: string): Promise<TItem[]> => {
  const items: TItem[] = [];
  let nextUrl: string | undefined = url;

  while (nextUrl) {
    const page: PagedListResponse<TItem> = await azureFetch<PagedListResponse<TItem>>(nextUrl, token);
    if (page.value && page.value.length > 0) {
      items.push(...page.value);
    }
    nextUrl = page.nextLink;
  }

  return items;
};

export const validateToken = async (token: string): Promise<void> => {
  try {
    await azureFetch(`${ARM}/subscriptions?api-version=${API.SUBSCRIPTIONS}`, token);
  } catch (e: unknown) {
    console.error('Token validation failed', e);

    if (e instanceof AzureError) {
      const msg = e.message;
      if (msg.includes('InvalidAuthenticationTokenAudience') || msg.includes('audience')) {
        throw new AzureError(
          'Token Error: It looks like you pasted a Graph Token into the Management Token field. Please generate a Management token using the first command.',
          e
        );
      }
      if (msg.includes('401')) {
        throw new AzureError('Authentication Failed: The token has expired or is invalid.', e);
      }
      throw e;
    }

    throw new AzureError(`Connection Failed: ${e instanceof Error ? e.message : String(e)}`, e);
  }
};

export const getSubscriptions = async (token: string): Promise<Subscription[]> => {
  const url = `${ARM}/subscriptions?api-version=${API.SUBSCRIPTIONS}`;
  const value = await azureFetchAllPages<SubscriptionResponse['value'][number]>(url, token);
  return parseSubscriptions({ value });
};

export const getTenants = async (token: string): Promise<Record<string, string>> => {
  try {
    const url = `${ARM}/tenants?api-version=${API.SUBSCRIPTIONS}`;
    const value = await azureFetchAllPages<TenantResponse['value'][number]>(url, token);
    return parseTenants({ value });
  } catch (e) {
    console.error('Failed to fetch tenants', e);
    return {};
  }
};

export const getRoleDefinitions = async (
  token: string,
  subscriptionId: string
): Promise<RoleDefinition[]> => {
  const url = `${ARM}/subscriptions/${subscriptionId}/providers/Microsoft.Authorization/roleDefinitions?api-version=${API.AUTHORIZATION}`;

  try {
    const value = await azureFetchAllPages<RoleDefinitionResponse['value'][number]>(url, token);
    const roles = parseRoleDefinitions({ value });

    // Filter to Key Vault related roles
    return roles.filter((role) => {
      const perms = role.properties.permissions;
      if (!perms || perms.length === 0) return false;

      const allDataActions = perms.flatMap((p) => p.dataActions || []);
      return allDataActions.join(',').toLowerCase().includes('microsoft.keyvault');
    });
  } catch (e) {
    console.error('Failed to fetch role definitions', e);
    return [];
  }
};

const getPrincipalTypesCache = async (
  token: string,
  subscriptionId: string
): Promise<Record<string, IdentityType>> => {
  const url = `${ARM}/subscriptions/${subscriptionId}/providers/Microsoft.Authorization/roleAssignments?api-version=${API.AUTHORIZATION}`;

  try {
    const value = await azureFetchAllPages<RoleAssignmentResponse['value'][number]>(url, token);
    return parsePrincipalTypes({ value });
  } catch (e) {
    console.warn('Failed to fetch role assignments for type resolution.', e);
    return {};
  }
};

export const getRoleAssignments = async (
  token: string,
  subscriptionId: string
): Promise<RoleAssignment[]> => {
  const url = `${ARM}/subscriptions/${subscriptionId}/providers/Microsoft.Authorization/roleAssignments?api-version=${API.AUTHORIZATION}`;

  try {
    const value = await azureFetchAllPages<RoleAssignment>(url, token);
    return parseRoleAssignments({ value });
  } catch (e) {
    console.error('Failed to fetch role assignments', e);
    return [];
  }
};

/**
 * Attempts to resolve Object IDs to Display Names AND Types using Microsoft Graph.
 * This is "best effort" - if the token lacks Graph scopes, we just return empty.
 * Accepts a specific 'token' which should ideally be a Graph-scoped token.
 */
export const resolveBatchIdentities = async (
  objectIds: string[],
  token: string
): Promise<Record<string, { name: string; type: IdentityType }>> => {
  if (objectIds.length === 0) return {};

  const uniqueIds = [...new Set(objectIds)];
  const results: Record<string, { name: string; type: IdentityType }> = {};
  const chunkSize = ANALYSIS_CONSTANTS.GRAPH_BATCH_SIZE;

  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
    const chunk = uniqueIds.slice(i, i + chunkSize);

    try {
      const response = await fetch(`${GRAPH}/directoryObjects/getByIds`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ids: chunk,
          types: ['user', 'group', 'servicePrincipal', 'application'],
        }),
      });

      if (response.ok) {
        const data = (await response.json()) as GraphResponse;
        Object.assign(results, parseGraphResponse(data));
      } else {
        console.warn(
          `Graph API resolution failed (Status: ${response.status}). Ensure you provided a valid Graph Token.`
        );
      }
    } catch (e) {
      console.debug('Graph API call failed', e);
    }
  }

  return results;
};

export const getKeyVaults = async (
  token: string,
  subscriptionId: string
): Promise<KeyVault[]> => {
  const listUrl = `${ARM}/subscriptions/${subscriptionId}/resources?$filter=resourceType eq 'Microsoft.KeyVault/vaults'&api-version=${API.RESOURCES}`;

  const [listValue, principalTypeCache] = await Promise.all([
    azureFetchAllPages<{ id: string }>(listUrl, token),
    getPrincipalTypesCache(token, subscriptionId),
  ]);

  if (!listValue || listValue.length === 0) {
    return [];
  }

  const concurrencyLimit = ANALYSIS_CONSTANTS.VAULT_CONCURRENCY_LIMIT;
  const results: KeyVault[] = [];

  for (let i = 0; i < listValue.length; i += concurrencyLimit) {
    const chunk = listValue.slice(i, i + concurrencyLimit);

    const chunkPromises = chunk.map(async (resource) => {
      try {
        const vaultUrl = `${ARM}${resource.id}?api-version=${API.KEYVAULT}`;
        const vaultData = await azureFetch<KeyVaultResponse>(vaultUrl, token);
        return parseKeyVaultResponse(vaultData, principalTypeCache);
      } catch (e) {
        console.error(`Failed to fetch details for vault ${resource.id}`, e);
        return null;
      }
    });

    const chunkResults = await Promise.all(chunkPromises);
    chunkResults.forEach((r) => {
      if (r) results.push(r);
    });
  }

  return results;
};
