import { UI_CONSTANTS } from '../constants';

export type PermissionKind = 'missing' | 'covered' | 'excess';

/** Max permission badges shown before the "+N more" disclosure. */
export const PERMISSION_VISIBLE_LIMIT = UI_CONSTANTS.PERMISSION_VISIBLE_LIMIT;

/**
 * Privileged data-plane operations (purge/release) are surfaced first and
 * flagged with a warning, since they grant destructive/sensitive access.
 */
export const isPrivilegedPermission = (perm: string): boolean => {
  const lower = perm.toLowerCase();
  return lower.includes('purge') || lower.includes('release');
};

/**
 * Order permissions for display. Excess permissions are sorted privileged-first
 * (then alphabetically) so the riskiest grants are most visible; other kinds keep
 * their given order. Never mutates the input array.
 */
export const orderPermissionsForDisplay = (perms: string[], kind: PermissionKind): string[] => {
  if (kind !== 'excess') return perms;
  return [...perms].sort((a, b) => {
    const aPriv = isPrivilegedPermission(a);
    const bPriv = isPrivilegedPermission(b);
    if (aPriv && !bPriv) return -1;
    if (!aPriv && bPriv) return 1;
    return a.localeCompare(b);
  });
};
