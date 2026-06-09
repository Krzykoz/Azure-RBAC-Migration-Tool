import { describe, it, expect } from 'vitest';
import { getBuiltInKeyVaultRoles } from '../builtInRoles';

describe('getBuiltInKeyVaultRoles', () => {
  it('loads the bundled built-in Key Vault data-plane roles', () => {
    const roles = getBuiltInKeyVaultRoles();
    expect(roles).toHaveLength(10);
    const names = roles.map((r) => r.properties.roleName);
    expect(names).toContain('Key Vault Administrator');
    expect(names).toContain('Key Vault Secrets User');
  });

  it('returns roles already normalized with iterable permission arrays', () => {
    for (const role of getBuiltInKeyVaultRoles()) {
      expect(role.properties.permissions.length).toBeGreaterThan(0);
      for (const perm of role.properties.permissions) {
        expect(Array.isArray(perm.dataActions)).toBe(true);
        expect(Array.isArray(perm.notDataActions)).toBe(true);
      }
    }
  });
});
