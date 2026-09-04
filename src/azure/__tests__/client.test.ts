import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getKeyVaults, getRoleAssignments, getRoleDefinitions, getSubscriptions, getTenants,
  resolveBatchIdentities,
} from '../client';
import { RoleAssignment } from '../../core/types';
import { AZURE_ENDPOINTS, ANALYSIS_CONSTANTS } from '../../core/constants';

const { ARM, GRAPH } = AZURE_ENDPOINTS;
const fetchMock = vi.fn<typeof fetch>();
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const vaultId = '/subscriptions/sub/resourceGroups/rg/providers/Microsoft.KeyVault/vaults/vault';
const vault = {
  id: vaultId, name: 'vault', location: 'eastus',
  properties: { accessPolicies: [{ tenantId: 't', objectId: 'principal', permissions: { secrets: ['Get'] } }] },
};
const assignment: RoleAssignment = {
  id: 'assignment', name: 'assignment', type: 'Microsoft.Authorization/roleAssignments',
  properties: { principalId: 'principal', principalType: 'Group', roleDefinitionId: 'role', scope: vaultId },
};
const role = (name: string, dataActions: string[]) => ({
  id: name, name,
  properties: { roleName: name, permissions: [{ dataActions }] },
});

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'debug').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  fetchMock.mockReset();
});

describe('ARM required data and pagination', () => {
  it.each([undefined, null])('loads all subscription pages with final nextLink %s', async (finalNextLink) => {
    const nextLink = `${ARM}/subscriptions?next=page2`;
    const first = { id: '/subscriptions/a', subscriptionId: 'a', displayName: 'A' };
    const second = { id: '/subscriptions/b', subscriptionId: 'b', displayName: 'B' };
    fetchMock.mockResolvedValueOnce(json({ value: [first], nextLink }))
      .mockResolvedValueOnce(json({ value: [second], nextLink: finalNextLink }));
    expect(await getSubscriptions('token')).toEqual([first, second]);
    expect(fetchMock.mock.calls[1][0]).toBe(nextLink);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['definitions', getRoleDefinitions],
    ['assignments', getRoleAssignments],
  ] as const)('propagates %s failures, including later pages', async (_label, load) => {
    fetchMock.mockResolvedValueOnce(json({ value: [], nextLink: `${ARM}/next` }))
      .mockResolvedValueOnce(json({ error: 'Forbidden' }, 403));
    await expect(load('token', 'sub')).rejects.toThrow('403');
    expect(console.error).toHaveBeenCalled();
  });

  it('does not turn an invalid list response into empty assignments', async () => {
    fetchMock.mockResolvedValue(json({ error: 'not a list' }));
    await expect(getRoleAssignments('token', 'sub')).rejects.toThrow('expected a value array');
  });

  it.each(['https://example.com/next', `${ARM}/subscriptions?api-version=2022-12-01`])(
    'rejects untrusted or repeated pagination links: %s', async (nextLink) => {
      fetchMock.mockResolvedValue(json({ value: [], nextLink }));
      await expect(getSubscriptions('token')).rejects.toThrow('pagination URL');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  );

  it.each([0, false, {}, []])('rejects non-string non-null pagination links: %j', async (nextLink) => {
    fetchMock.mockResolvedValue(json({ value: [], nextLink }));
    await expect(getSubscriptions('token')).rejects.toThrow('pagination URL');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retains optional tenant failure diagnostics', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    expect(await getTenants('token')).toEqual({});
    expect(console.error).toHaveBeenCalledWith('Failed to fetch tenants', expect.any(Error));
  });

  it('includes global and embedded wildcard roles and normalizes live permissions', async () => {
    fetchMock.mockResolvedValue(json({ value: [
      role('global', ['*']),
      role('embedded', ['Microsoft.*/vaults/secrets/getSecret/action']),
      role('embedded-trailing', ['Microsoft.*/vaults/*']),
      role('keyvault', ['microsoft.keyvault/vaults/secrets/*']),
      role('irrelevant', ['Microsoft.Storage/*']),
      role('management-only', []),
      { ...role('flat', []), properties: undefined, roleName: 'flat', permissions: [{ dataActions: ['*'] }] },
    ] }));
    const roles = await getRoleDefinitions('token', 'sub');
    expect(roles.map((r) => r.name)).toEqual(['global', 'embedded', 'embedded-trailing', 'keyvault', 'flat']);
    expect(roles[0].properties.permissions[0]).toEqual({
      actions: [], notActions: [], dataActions: ['*'], notDataActions: [],
    });
  });

  it('encodes subscription path input and rejects missing identifiers', async () => {
    fetchMock.mockResolvedValue(json({ value: [] }));
    await getRoleDefinitions('token', 'sub/?#');
    expect(String(fetchMock.mock.calls[0][0])).toContain('/subscriptions/sub%2F%3F%23/');
    await expect(getRoleAssignments('token', ' ')).rejects.toThrow('Subscription ID');
  });
});

describe('vault detail loading', () => {
  it('reuses fetched assignments as its principal-type cache without a second request', async () => {
    fetchMock.mockResolvedValueOnce(json({ value: [assignment] }))
      .mockResolvedValueOnce(json({ value: [{ id: vaultId }] }))
      .mockResolvedValueOnce(json(vault));
    const assignments = await getRoleAssignments('token', 'sub');
    const vaults = await getKeyVaults('token', 'sub', assignments);
    expect(vaults[0].accessPolicies[0].type).toBe('Group');
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/roleAssignments'))).toHaveLength(1);
  });

  it('fetches required assignments for direct callers that omit the cache', async () => {
    fetchMock.mockImplementation(async (url) => {
      if (String(url).includes('/roleAssignments')) return json({ value: [assignment] });
      if (String(url).includes('/resources?')) return json({ value: [{ id: vaultId }] });
      return json(vault);
    });
    expect((await getKeyVaults('token', 'sub'))[0].accessPolicies[0].type).toBe('Group');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not silently assume absence when default assignment loading fails', async () => {
    fetchMock.mockImplementation(async (url) =>
      String(url).includes('/roleAssignments') ? json({}, 403) : json({ value: [] }));
    await expect(getKeyVaults('token', 'sub')).rejects.toThrow('403');
  });

  it('fails the entire vault load with the failed vault ID instead of dropping details', async () => {
    const failedId = `${vaultId}-forbidden`;
    fetchMock.mockResolvedValueOnce(json({ value: [{ id: vaultId }, { id: failedId }] }))
      .mockResolvedValueOnce(json(vault))
      .mockResolvedValueOnce(json({}, 403));
    await expect(getKeyVaults('token', 'sub', [])).rejects.toThrow(`Failed to load vault "${failedId}"`);
  });

  it('rejects malformed vault details and unsafe resource paths', async () => {
    fetchMock.mockResolvedValueOnce(json({ value: [{ id: vaultId }] }))
      .mockResolvedValueOnce(json({ ...vault, name: 123 }));
    await expect(getKeyVaults('token', 'sub', [])).rejects.toThrow('Key Vault name');
    fetchMock.mockResolvedValueOnce(json({ value: [{ id: '/vaults/v?unexpected=1' }] }));
    await expect(getKeyVaults('token', 'sub', [])).rejects.toThrow('absolute ARM resource path');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe('Graph identity resolution', () => {
  it('deduplicates object IDs and batches 1000 IDs per getByIds request', async () => {
    const ids = Array.from({ length: 1001 }, (_, i) => `object-${i}`);
    fetchMock.mockResolvedValue(json({ value: [] }));
    await resolveBatchIdentities([...ids, ids[0]], 'graph-token');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).ids.length))
      .toEqual([1000, 1]);
    expect(fetchMock.mock.calls.every(([url]) => url === `${GRAPH}/directoryObjects/getByIds`)).toBe(true);
  });

  it('resolves client IDs separately and retains names under both application and object IDs', async () => {
    const appId = '12345678-1234-1234-1234-123456789abc';
    fetchMock.mockResolvedValueOnce(json({
      value: [{ id: 'user', displayName: 'Alice', '@odata.type': '#microsoft.graph.user' }],
    })).mockResolvedValueOnce(json({ id: 'service-principal', displayName: 'My app' }));
    const resolved = await resolveBatchIdentities(['user'], 'graph-token', [appId, appId]);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).ids).toEqual(['user']);
    expect(String(fetchMock.mock.calls[1][0])).toContain(`/servicePrincipals(appId='${appId}')`);
    expect(resolved.user.name).toBe('Alice');
    expect(resolved[appId]).toEqual({ name: 'My app', type: 'ServicePrincipal' });
    expect(resolved['service-principal']).toEqual(resolved[appId]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('bounds application lookup concurrency, including application-only requests', async () => {
    let active = 0;
    let maximum = 0;
    fetchMock.mockImplementation(async () => {
      active++;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 0));
      active--;
      return json({ id: 'sp', displayName: 'App' });
    });
    const ids = Array.from({ length: 12 }, (_, i) => `12345678-1234-1234-1234-${String(i).padStart(12, '0')}`);
    await resolveBatchIdentities([], 'graph-token', ids);
    expect(fetchMock).toHaveBeenCalledTimes(12);
    expect(maximum).toBe(ANALYSIS_CONSTANTS.VAULT_CONCURRENCY_LIMIT);
  });

  it('does not put malformed application IDs into a URL and logs optional failures', async () => {
    const resolved = await resolveBatchIdentities([], 'graph-token', ["x')/users?$filter=bad", '']);
    expect(resolved).toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledTimes(2);
  });

  it('logs Graph failures without failing required-data loading', async () => {
    fetchMock.mockResolvedValue(json({}, 403));
    expect(await resolveBatchIdentities(['object'], 'graph-token')).toEqual({});
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Status: 403'));
  });
});
