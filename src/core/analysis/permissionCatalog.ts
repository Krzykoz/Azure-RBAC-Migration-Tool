import { AccessPolicyEntry } from '../types';
import RBAC_MAPPING_CSV from '../../assets/accessPolicyRbacMapping.csv?raw';

/**
 * Maps a legacy access-policy verb (per category) to the RBAC data action(s)
 * that satisfy it. Shape: `{ [category]: { [verb]: rbacAction[] } }`.
 */
type PermissionMap = Record<string, Record<string, string[]>>;

/**
 * The abstraction the analysis engine depends on instead of module-global
 * singletons. It owns the legacy→RBAC mapping and the universe of known RBAC
 * actions, so the matching/coverage/strategy logic can be exercised in
 * isolation with a hand-built catalog.
 */
export interface PermissionCatalog {
  /** The parsed legacy verb → RBAC action map. */
  readonly map: PermissionMap;
  /** Every RBAC action the catalog knows about, in original (mixed) casing. */
  readonly knownActions: ReadonlySet<string>;
  /** Case-insensitive membership test against the known-action universe. */
  hasKnownActionLower(actionLower: string): boolean;
  /** Expand a legacy policy into the set of RBAC data actions it requires. */
  getRequiredActions(policy: AccessPolicyEntry): Set<string>;
}

const CATEGORY_ALIASES: Record<string, string> = {
  key: 'keys',
  secret: 'secrets',
  certificate: 'certificates',
  storage: 'storage',
};

/**
 * Parse the RBAC mapping CSV into a {@link PermissionMap}.
 *
 * The policy-permission column is "Category Action" (e.g. "Secret Set"); the
 * RBAC column may list several actions separated by `;`. Multi-word actions
 * (e.g. "ManageContacts") are joined and lowercased to form the verb key.
 */
const parsePermissionMap = (csvContent: string): PermissionMap => {
  const map: PermissionMap = { keys: {}, secrets: {}, certificates: {}, storage: {} };

  // Split on CRLF or LF and drop blank lines so a CRLF-saved CSV does not leave a
  // trailing carriage return on the last RBAC action of each row.
  const dataLines = csvContent.split(/\r?\n/).filter((line) => line.trim() !== '').slice(1);

  dataLines.forEach((line) => {
    const [policyPerm, rbacActions] = line.split(',');
    if (!policyPerm || !rbacActions) return;

    const parts = policyPerm.trim().split(' ');
    if (parts.length < 2) return;

    const categoryRaw = parts[0].toLowerCase();
    const actionKey = parts.slice(1).join('').toLowerCase(); // join handles multi-word actions
    const category = CATEGORY_ALIASES[categoryRaw] ?? categoryRaw;

    if (!map[category]) map[category] = {};
    map[category][actionKey] = rbacActions.split(';').map((s) => s.trim());
  });

  return map;
};

const collectKnownActions = (map: PermissionMap): Set<string> => {
  const known = new Set<string>();
  Object.values(map).forEach((catMap) =>
    Object.values(catMap).forEach((actions) => actions.forEach((a) => known.add(a)))
  );
  return known;
};

const expandRequiredActions = (map: PermissionMap, policy: AccessPolicyEntry): Set<string> => {
  const actions = new Set<string>();

  Object.entries(policy.permissions).forEach(([resourceType, perms]) => {
    if (perms === undefined) return;
    if (!Array.isArray(perms)) {
      throw new Error(`Permissions for ${resourceType} must be an array of strings.`);
    }

    const category = resourceType.toLowerCase();
    if (!Object.hasOwn(map, category)) {
      throw new Error(`Unsupported permission category: ${resourceType}.`);
    }
    const categoryMap = map[category];

    perms.forEach((perm) => {
      if (typeof perm !== 'string') {
        throw new Error(`Permissions for ${resourceType} must be an array of strings.`);
      }
      const verb = perm.toLowerCase();
      // "all"/"*" grants every mapped action in the category.
      if (verb === 'all' || verb === '*') {
        Object.values(categoryMap).forEach((rbacList) =>
          rbacList.forEach((action) => actions.add(action))
        );
      } else {
        if (!Object.hasOwn(categoryMap, verb)) {
          throw new Error(`Unsupported permission: ${resourceType}/${perm}. Update the permission mapping before migrating.`);
        }
        categoryMap[verb].forEach((action) => actions.add(action));
      }
    });
  });

  return new Set(new Map(Array.from(actions, (action) => [action.toLowerCase(), action])).values());
};

/** Build a {@link PermissionCatalog} from raw CSV content. Pure: no module state. */
export const createPermissionCatalog = (csvContent: string): PermissionCatalog => {
  const map = parsePermissionMap(csvContent);
  const knownActions = collectKnownActions(map);
  // Lowercased companion set for case-insensitive membership checks. Azure data
  // actions are mixed-case, so comparisons against lowercased input use this set.
  const knownActionsLower = new Set(Array.from(knownActions, (a) => a.toLowerCase()));

  return {
    map,
    knownActions,
    hasKnownActionLower: (actionLower) => knownActionsLower.has(actionLower),
    getRequiredActions: (policy) => expandRequiredActions(map, policy),
  };
};

/**
 * The catalog backed by the bundled mapping CSV. Used by the public facade so
 * callers need no wiring; tests can inject their own catalog instead.
 */
export const defaultPermissionCatalog: PermissionCatalog =
  createPermissionCatalog(RBAC_MAPPING_CSV);
