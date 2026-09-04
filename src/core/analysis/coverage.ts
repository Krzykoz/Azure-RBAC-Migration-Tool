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
 * (minus each permission entry's `notDataActions` exclusions). Explicit Key Vault
 * actions outside the catalog are also reported as excess.
 */
export const calculateCoverage = (
  required: Set<string>,
  role: RoleDefinition,
  catalog: PermissionCatalog
): RoleCoverage => {
  const covered = new Set<string>();
  const excess = new Set<string>();

  const requiredByLower = new Map(Array.from(required, (action) => [action.toLowerCase(), action]));
  const universe = new Map(Array.from(catalog.knownActions, (action) => [action.toLowerCase(), action]));
  requiredByLower.forEach((action, lower) => universe.set(lower, action));
  for (const permission of role.properties.permissions) {
    for (const action of permission.dataActions) {
      const lower = action.toLowerCase();
      if (lower.startsWith('microsoft.keyvault/') && !action.includes('*') && !universe.has(lower)) {
        universe.set(lower, action);
      }
    }
  }

  universe.forEach((action, lower) => {
    const granted = role.properties.permissions.some((permission) =>
      permission.dataActions.some((pattern) => actionMatches(pattern, action)) &&
      !permission.notDataActions.some((pattern) => actionMatches(pattern, action))
    );
    if (granted) (requiredByLower.has(lower) ? covered : excess).add(action);
  });

  return { covered, excess };
};
