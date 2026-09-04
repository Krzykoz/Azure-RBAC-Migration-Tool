import { RoleDefinition, RolePermission } from '../types';

/**
 * Shared normalization for Azure role-definition JSON coming from any source:
 * the bundled built-in roles file, pasted JSON, or a live ARM/CLI response.
 *
 * Accepts the common envelopes (`{ value: [...] }`, a bare array, or a single
 * object) and both shapes Azure emits:
 *  - ARM/REST: nested under `.properties`
 *  - Azure CLI: flat (`roleName`, `roleType`, `permissions`, ... at top level)
 *
 * It is intentionally defensive: every permission's action arrays are coerced
 * to arrays so the analysis engine can call `.some()`/`.forEach()` safely, and
 * roles missing a role name or permissions are dropped rather than crashing
 * downstream code.
 */

const toStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];

const normalizePermissions = (permissions: unknown): RolePermission[] => {
  if (!Array.isArray(permissions)) return [];
  return permissions.map((p: any) => ({
    actions: toStringArray(p?.actions),
    notActions: toStringArray(p?.notActions),
    dataActions: toStringArray(p?.dataActions),
    notDataActions: toStringArray(p?.notDataActions),
  }));
};

const toRoleArray = (input: unknown): any[] => {
  if (Array.isArray(input)) return input;
  if (input && typeof input === 'object') {
    const obj = input as Record<string, unknown>;
    if (Array.isArray(obj.value)) return obj.value;
    // Single role object (either ARM or flat CLI shape)
    if (obj.roleName || obj.properties || obj.id) return [obj];
  }
  return [];
};

const normalizeSingleRole = (raw: any): RoleDefinition | null => {
  if (!raw || typeof raw !== 'object') return null;
  if (
    (raw.id != null && typeof raw.id !== 'string') ||
    (raw.name != null && typeof raw.name !== 'string')
  ) return null;

  // ARM/REST shape already nests under `.properties`.
  // Flat Azure CLI shape exposes roleName/roleType/permissions at the top level.
  const props = raw.properties ?? {
    roleName: raw.roleName,
    description: raw.description,
    type: raw.roleType,
    permissions: raw.permissions,
    assignableScopes: raw.assignableScopes,
  };

  const roleName = props?.roleName;
  if (!roleName || typeof roleName !== 'string') return null;

  const permissions = normalizePermissions(props.permissions);
  // A role with no permission entries cannot cover anything; drop it so it
  // never silently appears to parse and then yields no matches downstream.
  if (permissions.length === 0) return null;

  return {
    id: raw.id ?? '',
    name: raw.name ?? '',
    type: raw.type ?? 'Microsoft.Authorization/roleDefinitions',
    properties: {
      roleName,
      description: props.description ?? '',
      type: props.type ?? 'BuiltInRole',
      permissions,
      assignableScopes: toStringArray(props.assignableScopes),
    },
  };
};

/**
 * Normalize an arbitrary parsed JSON value into a clean `RoleDefinition[]`.
 * Malformed entries are skipped.
 */
export const normalizeRoleDefinitions = (input: unknown): RoleDefinition[] =>
  toRoleArray(input)
    .map(normalizeSingleRole)
    .filter((r): r is RoleDefinition => r !== null);

/**
 * Parse a JSON string of role definitions into `RoleDefinition[]`.
 * Throws if the string is not valid JSON or yields no usable roles.
 */
export const parseRolesJson = (json: string): RoleDefinition[] => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e: any) {
    throw new Error(`Invalid JSON: ${e.message}`);
  }

  const roles = normalizeRoleDefinitions(parsed);
  if (roles.length === 0) {
    throw new Error('No valid Role Definitions found in JSON.');
  }
  return roles;
};
