import { RoleDefinition } from '../types';
import { actionMatches } from './actionMatching';
import { PermissionCatalog } from './permissionCatalog';

export interface RoleCoverage {
  covered: Set<string>;
  excess: Set<string>;
}

const grants = (role: RoleDefinition, action: string): boolean =>
  role.properties.permissions.some((permission) =>
    permission.dataActions.some((pattern) => actionMatches(pattern, action)) &&
    !permission.notDataActions.some((pattern) => actionMatches(pattern, action))
  );

// ponytail: cached per role object, since role definitions are never mutated after parsing.
const grantedCache = new WeakMap<RoleDefinition, { catalog: PermissionCatalog; granted: Map<string, string> }>();

/**
 * Every catalog-known action, plus every explicit Key Vault action the role lists, that the
 * role grants (minus each permission entry's `notDataActions`). Keyed by lowercased action.
 */
const grantedActions = (role: RoleDefinition, catalog: PermissionCatalog): Map<string, string> => {
  const cached = grantedCache.get(role);
  if (cached?.catalog === catalog) return cached.granted;

  const universe = new Map(Array.from(catalog.knownActions, (action) => [action.toLowerCase(), action]));
  for (const permission of role.properties.permissions) {
    for (const action of permission.dataActions) {
      const lower = action.toLowerCase();
      if (lower.startsWith('microsoft.keyvault/') && !action.includes('*') && !universe.has(lower)) {
        universe.set(lower, action);
      }
    }
  }
  const granted = new Map([...universe].filter(([, action]) => grants(role, action)));
  grantedCache.set(role, { catalog, granted });
  return granted;
};

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
  const granted = grantedActions(role, catalog);

  granted.forEach((action, lower) => {
    const requiredAction = requiredByLower.get(lower);
    if (requiredAction === undefined) excess.add(action);
    else covered.add(requiredAction);
  });
  // Required actions outside the role's universe are matched directly.
  requiredByLower.forEach((action, lower) => {
    if (!granted.has(lower) && !catalog.hasKnownActionLower(lower) && grants(role, action)) covered.add(action);
  });

  return { covered, excess };
};
