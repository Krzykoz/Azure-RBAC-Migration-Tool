import { describe, it, expect } from 'vitest';
import { formatPermissionLabel } from '../permissionFormat';

describe('formatPermissionLabel', () => {
    it('returns empty string for falsy input', () => {
        expect(formatPermissionLabel('')).toBe('');
    });

    it('collapses wildcard actions to "Full Access (*)"', () => {
        expect(formatPermissionLabel('*')).toBe('Full Access (*)');
        expect(formatPermissionLabel('Microsoft.KeyVault/vaults/*')).toBe('Full Access (*)');
        expect(formatPermissionLabel('Microsoft.KeyVault/vaults/secrets/*')).toBe('Full Access (*)');
    });

    it('strips the Key Vault prefix and /action suffix', () => {
        expect(
            formatPermissionLabel('Microsoft.KeyVault/vaults/secrets/getSecret/action')
        ).toBe('secrets/getSecret');
    });

    it('annotates read/write/delete verbs', () => {
        expect(formatPermissionLabel('Microsoft.KeyVault/vaults/keys/read')).toBe('keys (read)');
        expect(formatPermissionLabel('Microsoft.KeyVault/vaults/keys/write')).toBe('keys (write)');
        expect(formatPermissionLabel('Microsoft.KeyVault/vaults/keys/delete')).toBe('keys (delete)');
    });

    it('simplifies very long custom provider actions to the last two segments', () => {
        const long =
            'Microsoft.SomeProvider/really/deeply/nested/custom/providerAction/segment';
        expect(formatPermissionLabel(long)).toBe('providerAction/segment');
    });
});
