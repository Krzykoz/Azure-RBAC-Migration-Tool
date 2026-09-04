import { describe, it, expect } from 'vitest';
import { normalizeRoleDefinitions, parseRolesJson } from '../normalization';

describe('normalizeRoleDefinitions — envelope handling', () => {
  const armRole = {
    id: '/r/1',
    name: 'guid-1',
    properties: {
      roleName: 'Key Vault Secrets User',
      permissions: [{ dataActions: ['Microsoft.KeyVault/vaults/secrets/getSecret/action'] }],
    },
  };

  it('unwraps a { value: [...] } envelope', () => {
    const roles = normalizeRoleDefinitions({ value: [armRole] });
    expect(roles).toHaveLength(1);
    expect(roles[0].properties.roleName).toBe('Key Vault Secrets User');
  });

  it('accepts a bare array', () => {
    expect(normalizeRoleDefinitions([armRole])).toHaveLength(1);
  });

  it('accepts a single role object', () => {
    expect(normalizeRoleDefinitions(armRole)).toHaveLength(1);
  });

  it('returns [] for unusable input', () => {
    expect(normalizeRoleDefinitions(null)).toEqual([]);
    expect(normalizeRoleDefinitions('nope')).toEqual([]);
    expect(normalizeRoleDefinitions({})).toEqual([]);
  });
});

describe('normalizeRoleDefinitions — ARM vs flat CLI shapes', () => {
  it('reads the flat Azure CLI shape (top-level roleName/permissions)', () => {
    const cli = {
      id: '/r/2',
      name: 'guid-2',
      roleName: 'Custom Reader',
      roleType: 'CustomRole',
      permissions: [{ dataActions: ['Microsoft.KeyVault/vaults/secrets/readMetadata/action'] }],
      assignableScopes: ['/'],
    };
    const [role] = normalizeRoleDefinitions(cli);
    expect(role.properties.roleName).toBe('Custom Reader');
    expect(role.properties.type).toBe('CustomRole');
    expect(role.properties.permissions[0].dataActions).toContain(
      'Microsoft.KeyVault/vaults/secrets/readMetadata/action'
    );
  });

  it('coerces missing action arrays to [] so the engine can iterate safely', () => {
    const role = {
      roleName: 'Sparse',
      permissions: [{ dataActions: ['x'] }], // no actions/notActions/notDataActions
    };
    const [normalized] = normalizeRoleDefinitions(role);
    expect(normalized.properties.permissions[0].actions).toEqual([]);
    expect(normalized.properties.permissions[0].notActions).toEqual([]);
    expect(normalized.properties.permissions[0].notDataActions).toEqual([]);
  });

  it('drops entries with no roleName', () => {
    const roles = normalizeRoleDefinitions([
      { permissions: [{ dataActions: ['x'] }] }, // missing roleName
      { roleName: 'Keep', permissions: [{ dataActions: ['y'] }] },
    ]);
    expect(roles).toHaveLength(1);
    expect(roles[0].properties.roleName).toBe('Keep');
  });

  it('drops roles whose permissions array is empty', () => {
    const roles = normalizeRoleDefinitions([
      { roleName: 'Empty', permissions: [] },
      { roleName: 'Keep', permissions: [{ dataActions: ['y'] }] },
    ]);
    expect(roles.map((r) => r.properties.roleName)).toEqual(['Keep']);
  });

  it('drops malformed non-string identifiers instead of leaking them into coverage', () => {
    expect(normalizeRoleDefinitions({
      name: 42,
      roleName: 'Malformed',
      permissions: [{ dataActions: ['x'] }],
    })).toEqual([]);
  });
});

describe('parseRolesJson', () => {
  it('parses a valid JSON string', () => {
    const json = JSON.stringify([
      { roleName: 'R', permissions: [{ dataActions: ['x'] }] },
    ]);
    expect(parseRolesJson(json)).toHaveLength(1);
  });

  it('throws a descriptive error on invalid JSON', () => {
    expect(() => parseRolesJson('{not json')).toThrow(/Invalid JSON/);
  });

  it('throws when no usable roles are present', () => {
    expect(() => parseRolesJson('[]')).toThrow(/No valid Role Definitions/);
    expect(() => parseRolesJson(JSON.stringify([{ roleName: 'x', permissions: [] }]))).toThrow(
      /No valid Role Definitions/
    );
  });
});
