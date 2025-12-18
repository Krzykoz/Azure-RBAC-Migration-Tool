import { Subscription, KeyVault, AccessPolicyEntry, RoleDefinition, IdentityType, RoleAssignment } from '../types';
import {
  KeyVaultResponse,
  SubscriptionResponse,
  TenantResponse,
  RoleDefinitionResponse,
  RoleAssignmentResponse,
  RoleAssignmentListResponse,
  GraphResponse,
  parseKeyVaultResponse,
  parseSubscriptions,
  parseTenants,
  parseRoleDefinitions,
  parsePrincipalTypes,
  parseRoleAssignments,
  parseGraphResponse
} from './azureResponseParser';

const ARM_ENDPOINT = 'https://management.azure.com';
const GRAPH_ENDPOINT = 'https://graph.microsoft.com/v1.0';

const AZURE_API = {
  SUBSCRIPTIONS: '2022-12-01',
  RESOURCES: '2021-04-01',
  AUTHORIZATION: '2022-04-01', // Covers both Roles and Assignments
  KEYVAULT: '2024-11-01',      // Latest Stable
};

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

export const validateToken = async (token: string): Promise<void> => {
  try {
    // Try to list subscriptions as a validation check
    await azureFetch(`${ARM_ENDPOINT}/subscriptions?api-version=${AZURE_API.SUBSCRIPTIONS}`, token);
  } catch (e: unknown) {
    console.error("Token validation failed", e);

    if (e instanceof AzureError) {
      const msg = e.message;
      // Check for the specific Audience error (Graph token used in ARM endpoint)
      if (msg.includes("InvalidAuthenticationTokenAudience") || msg.includes("audience")) {
        throw new AzureError("Token Error: It looks like you pasted a Graph Token into the Management Token field. Please generate a Management token using the first command.", e);
      }

      if (msg.includes("401")) {
        throw new AzureError("Authentication Failed: The token has expired or is invalid.", e);
      }

      throw e;
    }

    throw new AzureError(`Connection Failed: ${e instanceof Error ? e.message : String(e)}`, e);
  }
};

export const getSubscriptions = async (token: string): Promise<Subscription[]> => {
  const data = await azureFetch<SubscriptionResponse>(`${ARM_ENDPOINT}/subscriptions?api-version=${AZURE_API.SUBSCRIPTIONS}`, token);
  return parseSubscriptions(data);
};

export const getTenants = async (token: string): Promise<Record<string, string>> => {
  try {
    const data = await azureFetch<TenantResponse>(`${ARM_ENDPOINT}/tenants?api-version=2022-12-01`, token);
    return parseTenants(data);
  } catch (e) {
    console.error("Failed to fetch tenants", e);
    return {};
  }
};

export const getRoleDefinitions = async (token: string, subscriptionId: string): Promise<RoleDefinition[]> => {
  // Fetch both BuiltIn and Custom roles
  const url = `${ARM_ENDPOINT}/subscriptions/${subscriptionId}/providers/Microsoft.Authorization/roleDefinitions?api-version=${AZURE_API.AUTHORIZATION}`;

  try {
    const data = await azureFetch<RoleDefinitionResponse>(url, token);
    return parseRoleDefinitions(data);
  } catch (e) {
    console.error("Failed to fetch role definitions", e);
    return [];
  }
};

// Fetch role assignments to build a cache of Principal Types (User vs Group vs SP)
// This uses ARM, so it shares the same token and is reliable.
const getPrincipalTypesCache = async (token: string, subscriptionId: string): Promise<Record<string, IdentityType>> => {
  const url = `${ARM_ENDPOINT}/subscriptions/${subscriptionId}/providers/Microsoft.Authorization/roleAssignments?api-version=${AZURE_API.AUTHORIZATION}`;

  try {
    const data = await azureFetch<RoleAssignmentResponse>(url, token);
    return parsePrincipalTypes(data);
  } catch (e) {
    console.warn("Failed to fetch role assignments for type resolution.", e);
    return {};
  }
};

export const getRoleAssignments = async (token: string, subscriptionId: string): Promise<RoleAssignment[]> => {
  const url = `${ARM_ENDPOINT}/subscriptions/${subscriptionId}/providers/Microsoft.Authorization/roleAssignments?api-version=${AZURE_API.AUTHORIZATION}`;
  try {
    const data = await azureFetch<RoleAssignmentListResponse>(url, token);
    return parseRoleAssignments(data);
  } catch (e) {
    console.error("Failed to fetch role assignments", e);
    return [];
  }
};

/**
 * Attempts to resolve Object IDs to Display Names AND Types using Microsoft Graph.
 * This is "best effort" - if the token lacks Graph scopes, we just return empty.
 * Accepts a specific 'token' which should ideally be a Graph-scoped token.
 */
export const resolveBatchIdentities = async (objectIds: string[], token: string): Promise<Record<string, { name: string, type: IdentityType }>> => {
  if (objectIds.length === 0) return {};

  const uniqueIds = [...new Set(objectIds)];
  const results: Record<string, { name: string, type: IdentityType }> = {};
  const CHUNK_SIZE = 20; // Safe batch size

  // Process in chunks
  for (let i = 0; i < uniqueIds.length; i += CHUNK_SIZE) {
    const chunk = uniqueIds.slice(i, i + CHUNK_SIZE);

    try {
      const response = await fetch(`${GRAPH_ENDPOINT}/directoryObjects/getByIds`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ids: chunk,
          types: ['user', 'group', 'servicePrincipal', 'application']
        })
      });

      if (response.ok) {
        const data = await response.json() as GraphResponse;
        const parsedChunk = parseGraphResponse(data);
        Object.assign(results, parsedChunk);
      } else {
        console.warn(`Graph API resolution failed (Status: ${response.status}). Ensure you provided a valid Graph Token.`);
      }
    } catch (e) {
      // Suppress errors (e.g. 401/403 if token is ARM-only)
      console.debug("Graph API call failed", e);
    }
  }

  return results;
};

interface KeyVaultListResponse {
  value: Array<{ id: string }>;
}

export const getKeyVaults = async (token: string, subscriptionId: string): Promise<KeyVault[]> => {
  // 1. List Key Vault resources
  const listUrl = `${ARM_ENDPOINT}/subscriptions/${subscriptionId}/resources?$filter=resourceType eq 'Microsoft.KeyVault/vaults'&api-version=${AZURE_API.RESOURCES}`;

  // Parallel fetch: Vaults list AND Principal Types from Role Assignments
  const [listData, principalTypeCache] = await Promise.all([
    azureFetch<KeyVaultListResponse>(listUrl, token),
    getPrincipalTypesCache(token, subscriptionId)
  ]);

  if (!listData.value || listData.value.length === 0) {
    return [];
  }

  // 2. Fetch details for each vault
  // 2. Fetch details for each vault with concurrency limiting
  const CONCURRENCY_LIMIT = 5;
  const results: KeyVault[] = [];

  for (let i = 0; i < listData.value.length; i += CONCURRENCY_LIMIT) {
    const chunk = listData.value.slice(i, i + CONCURRENCY_LIMIT);

    const chunkPromises = chunk.map(async (resource) => {
      try {
        const vaultUrl = `${ARM_ENDPOINT}${resource.id}?api-version=${AZURE_API.KEYVAULT}`;
        const vaultData = await azureFetch<KeyVaultResponse>(vaultUrl, token);

        return parseKeyVaultResponse(vaultData, principalTypeCache);
      } catch (e) {
        console.error(`Failed to fetch details for vault ${resource.id}`, e);
        return null;
      }
    });

    const chunkResults = await Promise.all(chunkPromises);
    chunkResults.forEach(r => {
      if (r) results.push(r);
    });
  }

  return results;
};
