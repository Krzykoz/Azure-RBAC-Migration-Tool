import { RoleDefinition } from '../types';
import { normalizeRoleDefinitions } from './normalization';
import builtInRolesRaw from '../../assets/builtInKeyVaultRoles.json';

/**
 * Returns the bundled Azure Key Vault data-plane built-in roles, normalized to
 * `RoleDefinition[]`. This powers the fully-offline manual mode (no token or
 * pasted JSON required).
 *
 * The role data lives in `src/assets/builtInKeyVaultRoles.json` so it stays
 * decoupled from code and can be refreshed with `npm run update-roles` when
 * Azure changes its built-in roles.
 */
export const getBuiltInKeyVaultRoles = (): RoleDefinition[] =>
  normalizeRoleDefinitions(builtInRolesRaw);
