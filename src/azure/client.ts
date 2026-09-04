import { Subscription, KeyVault, RoleDefinition, IdentityType, RoleAssignment } from '../core/types';
import {
  KeyVaultResponse,
  SubscriptionResponse,
  TenantResponse,
  GraphResponse,
  parseKeyVaultResponse,
  parseSubscriptions,
  parseTenants,
  parsePrincipalTypes,
  parseGraphResponse,
} from './parsers';
import { AZURE_API_VERSIONS, AZURE_ENDPOINTS, ANALYSIS_CONSTANTS } from '../core/constants';
import { actionMatches } from '../core/analysis/actionMatching';
import { defaultPermissionCatalog } from '../core/analysis/permissionCatalog';
import { normalizeRoleDefinitions } from '../core/roles/normalization';

const { ARM, GRAPH } = AZURE_ENDPOINTS;
const API = AZURE_API_VERSIONS;

class AzureError extends Error {
  constructor(message: string, public readonly originalError?: unknown) {
    super(message);
    this.name = 'AzureError';
  }
}

const azureFetch = async <T>(url: string, token: string): Promise<T> => {
  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
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
  value: TItem[];
  nextLink?: string | null;
}

const encodeIdentifier = (value: string, label: string): string => {
  if (typeof value !== 'string' || !value.trim() || value === '.' || value === '..') {
    throw new AzureError(`${label} must be a nonempty identifier.`);
  }
  return encodeURIComponent(value);
};

const encodeResourceId = (id: string): string => {
  if (typeof id !== 'string' || !id.startsWith('/') || /[?#\\]/.test(id)) {
    throw new AzureError('Vault resource ID must be an absolute ARM resource path.');
  }
  return '/' + id.slice(1).split('/').map((part) => encodeIdentifier(part, 'Vault resource ID segment')).join('/');
};

// ARM list endpoints return at most one page of results plus an absolute `nextLink` URL.
// This helper follows nextLink until exhausted so large subscriptions are not silently truncated.
const azureFetchAllPages = async <TItem>(url: string, token: string): Promise<TItem[]> => {
  const items: TItem[] = [];
  let nextUrl: string | undefined = url;
  const visited = new Set<string>();

  while (nextUrl) {
    const parsedUrl = new URL(nextUrl);
    if (parsedUrl.origin !== ARM || parsedUrl.username || parsedUrl.password || visited.has(parsedUrl.href)) {
      throw new AzureError('Azure API returned an invalid or repeated pagination URL.');
    }
    visited.add(parsedUrl.href);
    const page: PagedListResponse<TItem> = await azureFetch<PagedListResponse<TItem>>(nextUrl, token);
    if (!page || !Array.isArray(page.value)) {
      throw new AzureError('Azure API returned an invalid list: expected a value array.');
    }
    if (page.nextLink != null && (typeof page.nextLink !== 'string' || !page.nextLink.trim())) {
      throw new AzureError('Azure API returned an invalid pagination URL.');
    }
    items.push(...page.value);
    nextUrl = page.nextLink ?? undefined;
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
  const url = `${ARM}/subscriptions/${encodeIdentifier(subscriptionId, 'Subscription ID')}/providers/Microsoft.Authorization/roleDefinitions?api-version=${API.AUTHORIZATION}`;

  try {
    const roles = normalizeRoleDefinitions(await azureFetchAllPages<unknown>(url, token));
    const knownActions = [...defaultPermissionCatalog.knownActions];

    return roles.filter((role) => role.properties.permissions.some((permission) =>
      permission.dataActions.some((action) =>
        action.toLowerCase().includes('microsoft.keyvault') ||
        knownActions.some((known) => actionMatches(action, known))
      )
    ));
  } catch (e) {
    console.error('Failed to fetch role definitions', e);
    throw e;
  }
};

export const getRoleAssignments = async (
  token: string,
  subscriptionId: string
): Promise<RoleAssignment[]> => {
  const url = `${ARM}/subscriptions/${encodeIdentifier(subscriptionId, 'Subscription ID')}/providers/Microsoft.Authorization/roleAssignments?api-version=${API.AUTHORIZATION}`;

  try {
    return await azureFetchAllPages<RoleAssignment>(url, token);
  } catch (e) {
    console.error('Failed to fetch role assignments', e);
    throw e;
  }
};

/**
 * Attempts to resolve Object IDs to Display Names AND Types using Microsoft Graph.
 * This is "best effort" - if the token lacks Graph scopes, we just return empty.
 * Accepts a specific 'token' which should ideally be a Graph-scoped token.
 */
export const resolveBatchIdentities = async (
  objectIds: string[],
  token: string,
  applicationIds: string[] = []
): Promise<Record<string, { name: string; type: IdentityType }>> => {
  if (objectIds.length === 0 && applicationIds.length === 0) return {};

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

  const uniqueAppIds = [...new Set(applicationIds)];
  const concurrencyLimit = ANALYSIS_CONSTANTS.VAULT_CONCURRENCY_LIMIT;
  for (let i = 0; i < uniqueAppIds.length; i += concurrencyLimit) {
    await Promise.all(uniqueAppIds.slice(i, i + concurrencyLimit).map(async (appId) => {
      try {
        if (typeof appId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(appId)) {
          throw new AzureError('Application ID must be a GUID for Graph lookup.');
        }
        const url = `${GRAPH}/servicePrincipals(appId='${encodeURIComponent(appId)}')?$select=id,displayName,appDisplayName`;
        const principal = await azureFetch<GraphResponse['value'][number]>(url, token);
        const resolved = parseGraphResponse({
          value: [{ ...principal, '@odata.type': '#microsoft.graph.servicePrincipal' }],
        });
        Object.assign(results, resolved);
        if (resolved[principal.id]) results[appId] = resolved[principal.id];
      } catch (e) {
        console.warn(`Graph application resolution failed for ${appId}`, e);
      }
    }));
  }

  return results;
};

export const getKeyVaults = async (
  token: string,
  subscriptionId: string,
  roleAssignments?: RoleAssignment[]
): Promise<KeyVault[]> => {
  const listUrl = `${ARM}/subscriptions/${encodeIdentifier(subscriptionId, 'Subscription ID')}/resources?$filter=resourceType eq 'Microsoft.KeyVault/vaults'&api-version=${API.RESOURCES}`;

  const [listValue, assignments] = await Promise.all([
    azureFetchAllPages<{ id: string }>(listUrl, token),
    roleAssignments ?? getRoleAssignments(token, subscriptionId),
  ]);
  const principalTypeCache = parsePrincipalTypes({ value: assignments });

  if (!listValue || listValue.length === 0) {
    return [];
  }

  const concurrencyLimit = ANALYSIS_CONSTANTS.VAULT_CONCURRENCY_LIMIT;
  const results: KeyVault[] = [];

  for (let i = 0; i < listValue.length; i += concurrencyLimit) {
    const chunk = listValue.slice(i, i + concurrencyLimit);

    const chunkPromises = chunk.map(async (resource) => {
      try {
        const vaultUrl = `${ARM}${encodeResourceId(resource.id)}?api-version=${API.KEYVAULT}`;
        const vaultData = await azureFetch<KeyVaultResponse>(vaultUrl, token);
        return parseKeyVaultResponse(vaultData, principalTypeCache);
      } catch (e) {
        console.error(`Failed to fetch details for vault ${resource.id}`, e);
        throw new AzureError(
          `Failed to load vault "${resource.id}": ${e instanceof Error ? e.message : String(e)}`,
          e
        );
      }
    });

    const chunkResults = await Promise.all(chunkPromises);
    results.push(...chunkResults);
  }

  return results;
};
