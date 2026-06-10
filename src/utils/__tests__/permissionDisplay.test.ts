import { describe, it, expect } from 'vitest';
import {
    PERMISSION_VISIBLE_LIMIT,
    isPrivilegedPermission,
    orderPermissionsForDisplay,
    permissionBadgeDescriptor,
    roleBreakdownCanExpand,
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

describe('roleBreakdownCanExpand', () => {
    const fill = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);

    it('is false when both covered and excess fit within the limit', () => {
        expect(
            roleBreakdownCanExpand({ covered: fill(PERMISSION_VISIBLE_LIMIT), excess: fill(0) })
        ).toBe(false);
    });

    it('is true when covered overflows', () => {
        expect(
            roleBreakdownCanExpand({ covered: fill(PERMISSION_VISIBLE_LIMIT + 1), excess: [] })
        ).toBe(true);
    });

    it('is true when excess overflows independently of covered', () => {
        expect(
            roleBreakdownCanExpand({ covered: [], excess: fill(PERMISSION_VISIBLE_LIMIT + 1) })
        ).toBe(true);
    });
});

describe('permissionBadgeDescriptor', () => {
    it('marks missing with a leading alert and no plus', () => {
        expect(permissionBadgeDescriptor('keys/read', 'missing')).toEqual({
            variant: 'missing',
            privileged: false,
            leadingAlert: true,
            plusPrefix: false,
            trailingAlert: false,
        });
    });

    it('marks covered plainly', () => {
        expect(permissionBadgeDescriptor('keys/read', 'covered')).toEqual({
            variant: 'covered',
            privileged: false,
            leadingAlert: false,
            plusPrefix: false,
            trailingAlert: false,
        });
    });

    it('marks ordinary excess with a plus prefix and no alert', () => {
        const d = permissionBadgeDescriptor('secrets/backup/action', 'excess');
        expect(d.variant).toBe('excess');
        expect(d.privileged).toBe(false);
        expect(d.plusPrefix).toBe(true);
        expect(d.trailingAlert).toBe(false);
    });

    it('marks privileged excess (purge/release) with its own variant and a trailing alert', () => {
        const d = permissionBadgeDescriptor('secrets/purge/action', 'excess');
        expect(d.variant).toBe('excess-priv');
        expect(d.privileged).toBe(true);
        expect(d.plusPrefix).toBe(true);
        expect(d.trailingAlert).toBe(true);
    });
});
