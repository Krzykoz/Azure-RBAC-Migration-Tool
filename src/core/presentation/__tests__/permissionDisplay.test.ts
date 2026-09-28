import { describe, it, expect } from 'vitest';
import {
    PERMISSION_VISIBLE_LIMIT,
    isPrivilegedPermission,
    orderPermissionsForDisplay,
} from '../permissionDisplay';
import { UI_CONSTANTS } from '../../constants';

describe('PERMISSION_VISIBLE_LIMIT', () => {
    it('is sourced from the shared UI constant (single source of truth)', () => {
        expect(PERMISSION_VISIBLE_LIMIT).toBe(UI_CONSTANTS.PERMISSION_VISIBLE_LIMIT);
    });
});

describe('isPrivilegedPermission', () => {
    it('flags purge and release operations (case-insensitive)', () => {
        expect(isPrivilegedPermission('Microsoft.KeyVault/vaults/secrets/purge/action')).toBe(true);
        expect(isPrivilegedPermission('Microsoft.KeyVault/vaults/keys/RELEASE/action')).toBe(true);
        expect(isPrivilegedPermission('Purge')).toBe(true);
    });

    it('does not flag ordinary operations', () => {
        expect(isPrivilegedPermission('Microsoft.KeyVault/vaults/secrets/getSecret/action')).toBe(false);
        expect(isPrivilegedPermission('keys/read')).toBe(false);
    });
});

describe('orderPermissionsForDisplay', () => {
    it('sorts excess privileged-first, then alphabetically', () => {
        const result = orderPermissionsForDisplay(['bAction', 'purge', 'aAction', 'release'], 'excess');
        expect(result).toEqual(['purge', 'release', 'aAction', 'bAction']);
    });

    it('leaves missing and covered in their original order', () => {
        const input = ['zeta', 'alpha', 'purge'];
        expect(orderPermissionsForDisplay(input, 'missing')).toEqual(['zeta', 'alpha', 'purge']);
        expect(orderPermissionsForDisplay(input, 'covered')).toEqual(['zeta', 'alpha', 'purge']);
    });

    it('does not mutate the input array', () => {
        const input = ['bAction', 'purge', 'aAction'];
        const copy = [...input];
        orderPermissionsForDisplay(input, 'excess');
        expect(input).toEqual(copy);
    });
});
