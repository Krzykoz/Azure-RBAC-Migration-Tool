import { UI_CONSTANTS } from '../constants';
import { RoleBreakdown } from '../types';

/**
 * Single source of truth for how permission badges are ordered and truncated.
 * Both the live view and the static HTML export consume these so the two never
 * drift apart.
 */

type PermissionKind = 'missing' | 'covered' | 'excess';

/** Max permission badges shown before the "+N more" / Show All affordance. */
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

/**
 * Whether a role's covered/excess lists exceed the visible limit and therefore
 * need a Show All / Show Less toggle. Covered and excess are checked
 * independently (either overflowing warrants the toggle).
 */
export const roleBreakdownCanExpand = (role: Pick<RoleBreakdown, 'covered' | 'excess'>): boolean =>
  role.covered.length > PERMISSION_VISIBLE_LIMIT || role.excess.length > PERMISSION_VISIBLE_LIMIT;

/**
 * Visual variant of a permission badge. Privileged excess gets its own variant so
 * both renderers can highlight destructive grants (purge/release) more strongly.
 */
export type PermissionBadgeVariant = 'missing' | 'covered' | 'excess' | 'excess-priv';

interface PermissionBadgeDescriptor {
  variant: PermissionBadgeVariant;
  privileged: boolean;
  /** Missing badges show a leading warning icon. */
  leadingAlert: boolean;
  /** Excess badges are prefixed with "+ ". */
  plusPrefix: boolean;
  /** Privileged excess badges show a trailing warning icon. */
  trailingAlert: boolean;
}

/**
 * Decide how a single permission badge should look, given its kind. Centralizes
 * the missing/covered/excess(+privileged) branching that both renderers need;
 * each maps the returned variant to its own class names (Tailwind vs. CSS).
 */
export const permissionBadgeDescriptor = (
  perm: string,
  kind: PermissionKind
): PermissionBadgeDescriptor => {
  if (kind === 'missing') {
    return { variant: 'missing', privileged: false, leadingAlert: true, plusPrefix: false, trailingAlert: false };
  }
  if (kind === 'covered') {
    return { variant: 'covered', privileged: false, leadingAlert: false, plusPrefix: false, trailingAlert: false };
  }
  const privileged = isPrivilegedPermission(perm);
  return {
    variant: privileged ? 'excess-priv' : 'excess',
    privileged,
    leadingAlert: false,
    plusPrefix: true,
    trailingAlert: privileged,
  };
};
