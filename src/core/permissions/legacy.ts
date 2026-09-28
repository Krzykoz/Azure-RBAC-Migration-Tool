/** The legacy (access-policy) Key Vault permission catalog, per category. */
export const LEGACY_KEY_VAULT_PERMISSIONS: Record<string, string[]> = {
  keys: [
    'Get', 'List', 'Update', 'Create', 'Import', 'Delete', 'Recover',
    'Backup', 'Restore', 'Decrypt', 'Encrypt', 'UnwrapKey', 'WrapKey',
    'Verify', 'Sign', 'Purge', 'Release', 'Rotate', 'GetRotationPolicy',
    'SetRotationPolicy',
  ],
  secrets: [
    'Get', 'List', 'Set', 'Delete', 'Recover', 'Backup', 'Restore', 'Purge',
  ],
  certificates: [
    'Get', 'List', 'Update', 'Create', 'Import', 'Delete', 'Recover',
    'Backup', 'Restore', 'ManageContacts', 'ManageIssuers', 'GetIssuers',
    'ListIssuers', 'SetIssuers', 'DeleteIssuers', 'Purge',
  ],
  storage: [
    'Get', 'List', 'Delete', 'Set', 'Update', 'RegenerateKey', 'GetSas',
    'ListSas', 'DeleteSas', 'SetSas', 'Recover', 'Backup', 'Restore', 'Purge',
  ],
};

/** Privileged verbs an access policy's "all" does not grant; they must be listed explicitly. */
export const isExcludedFromAll = (permission: string): boolean =>
  ['purge', 'release'].includes(permission.toLowerCase());

/** What "all" in each category expands to. */
export const KEY_VAULT_ALL_PERMISSIONS: Record<string, string[]> = Object.fromEntries(
  Object.entries(LEGACY_KEY_VAULT_PERMISSIONS).map(([category, perms]) => [category, perms.filter((p) => !isExcludedFromAll(p))])
);
