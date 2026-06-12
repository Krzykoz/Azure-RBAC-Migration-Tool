import { RoleDefinition } from '../types';
import { actionMatches } from './actionMatching';
import { PermissionCatalog } from './permissionCatalog';

export interface RoleCoverage {
  covered: Set<string>;
  excess: Set<string>;
}

/**
 * Compute which of the `required` actions a single role covers, and which extra
 * (excess) Key Vault actions it grants beyond the requirement.
 *
 * Wildcard data actions are expanded against the catalog's known-action universe
 * (minus the role's own `notDataActions` exclusions). Non-wildcard excess is only
 * counted for recognized actions so stray strings are ignored.
 */
export const calculateCoverage = (
  required: Set<string>,
  role: RoleDefinition,
  catalog: PermissionCatalog
): RoleCoverage => {
  const covered = new Set<string>();
  const excess = new Set<string>();

  // Collect this role's Key Vault data actions and its exclusions (notDataActions).
  const dataActions: string[] = [];
  const notDataActions: string[] = [];
  role.properties.permissions.forEach((p) => {
    (p.dataActions || []).forEach((da) => {
      if (da.toLowerCase().includes('microsoft.keyvault')) dataActions.push(da);
    });
    (p.notDataActions || []).forEach((na) => notDataActions.push(na));
  });

  const isExcluded = (action: string): boolean =>
    notDataActions.some((na) => actionMatches(na, action));

  dataActions.forEach((da) => {
    if (da.includes('*')) {
      // Expand wildcard against known universe, minus anything the role excludes.
      catalog.knownActions.forEach((knownAction) => {
        if (actionMatches(da, knownAction) && !isExcluded(knownAction)) {
          (required.has(knownAction) ? covered : excess).add(knownAction);
        }
      });
      return;
    }

    if (isExcluded(da)) return;

    const matchesReq = Array.from(required).find((req) => req.toLowerCase() === da.toLowerCase());
    if (matchesReq) {
      covered.add(matchesReq);
    } else if (catalog.hasKnownActionLower(da.toLowerCase()) || da.toLowerCase().endsWith('/action')) {
      // Only count recognized data actions as excess (ignore random strings).
      excess.add(da);
    }
  });

  return { covered, excess };
};
