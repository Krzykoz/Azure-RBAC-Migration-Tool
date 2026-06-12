import { describe, it, expect } from 'vitest';
import {
  parseKeyVaultResponse,
  parseGraphResponse,
  parsePrincipalTypes,
  KeyVaultResponse,
} from '../parsers';
import { IdentityType } from '../../core/types';

const vault = (
  accessPolicies: NonNullable<KeyVaultResponse['properties']['accessPolicies']>
): KeyVaultResponse => ({
  id: '/vaults/v',
  name: 'v',
  location: 'eastus',
  properties: { sku: { name: 'Standard' }, accessPolicies },
});

describe('parseKeyVaultResponse — identity typing', () => {
  it('infers Application when applicationId is present', () => {
    const kv = parseKeyVaultResponse(
      vault([{ tenantId: 't', objectId: 'o1', applicationId: 'a1', permissions: { secrets: ['Get'] } }]),
      {}
    );
    expect(kv.accessPolicies[0].type).toBe('Application');
  });

  it('falls back to the principal-type cache for users/groups', () => {
    const cache: Record<string, IdentityType> = { o2: 'Group' };
    const kv = parseKeyVaultResponse(
      vault([{ tenantId: 't', objectId: 'o2', permissions: { secrets: ['Get'] } }]),
      cache
    );
    expect(kv.accessPolicies[0].type).toBe('Group');
  });

  it('leaves type Unknown when nothing identifies the principal', () => {
    const kv = parseKeyVaultResponse(
      vault([{ tenantId: 't', objectId: 'o3', permissions: { secrets: ['Get'] } }]),
      {}
    );
    expect(kv.accessPolicies[0].type).toBe('Unknown');
  });
});

describe('parseKeyVaultResponse — "All" expansion', () => {
  it('expands secrets "all" to standard verbs and excludes Purge', () => {
    const kv = parseKeyVaultResponse(
      vault([{ tenantId: 't', objectId: 'o1', permissions: { secrets: ['all'] } }]),
      {}
    );
    const secrets = kv.accessPolicies[0].permissions.secrets!;
    expect(secrets).toEqual(['Get', 'List', 'Set', 'Delete', 'Recover', 'Backup', 'Restore']);
    expect(secrets).not.toContain('Purge');
  });

  it('keeps an explicit Purge alongside the expanded set with canonical casing', () => {
    const kv = parseKeyVaultResponse(
      vault([{ tenantId: 't', objectId: 'o1', permissions: { secrets: ['All', 'purge'] } }]),
      {}
    );
    const secrets = kv.accessPolicies[0].permissions.secrets!;
    expect(secrets).toContain('Get');
    expect(secrets).toContain('Purge'); // canonical casing restored
  });

  it('passes through explicit permission lists unchanged', () => {
    const kv = parseKeyVaultResponse(
      vault([{ tenantId: 't', objectId: 'o1', permissions: { secrets: ['Get', 'List'] } }]),
      {}
    );
    expect(kv.accessPolicies[0].permissions.secrets).toEqual(['Get', 'List']);
  });
});

describe('parsePrincipalTypes', () => {
  it('builds a principalId → type cache', () => {
    const cache = parsePrincipalTypes({
      value: [
        { properties: { principalId: 'p1', principalType: 'User' } },
        { properties: { principalId: 'p2', principalType: 'ServicePrincipal' } },
      ],
    });
    expect(cache).toEqual({ p1: 'User', p2: 'ServicePrincipal' });
  });

  it('tolerates missing data', () => {
    expect(parsePrincipalTypes({ value: [] })).toEqual({});
  });
});

describe('parseGraphResponse', () => {
  it('maps OData types to identity types and resolves names', () => {
    const map = parseGraphResponse({
      value: [
        { id: 'u', displayName: 'Alice', '@odata.type': '#microsoft.graph.user' },
        { id: 'g', displayName: 'Admins', '@odata.type': '#microsoft.graph.group' },
        { id: 's', displayName: 'SP', '@odata.type': '#microsoft.graph.servicePrincipal' },
        { id: 'a', displayName: 'App', '@odata.type': '#microsoft.graph.application' },
      ],
    });
    expect(map.u).toEqual({ name: 'Alice', type: 'User' });
    expect(map.g.type).toBe('Group');
    expect(map.s.type).toBe('ServicePrincipal');
    expect(map.a.type).toBe('Application');
  });

  it('falls back through the name chain and drops nameless entries', () => {
    const map = parseGraphResponse({
      value: [
        { id: 'x', userPrincipalName: 'x@contoso.com', '@odata.type': '#microsoft.graph.user' },
        { id: 'nameless', '@odata.type': '#microsoft.graph.user' },
      ],
    });
    expect(map.x.name).toBe('x@contoso.com');
    expect(map.nameless).toBeUndefined();
  });
});
