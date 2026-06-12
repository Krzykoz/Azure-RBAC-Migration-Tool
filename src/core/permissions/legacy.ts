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

// "All" in a category implies all standard permissions, excluding "Purge" which is privileged.
export const KEY_VAULT_ALL_PERMISSIONS: Record<string, string[]> = {
  keys: LEGACY_KEY_VAULT_PERMISSIONS.keys.filter((p) => p !== 'Purge' && p !== 'Release'),
  secrets: LEGACY_KEY_VAULT_PERMISSIONS.secrets.filter((p) => p !== 'Purge'),
  certificates: LEGACY_KEY_VAULT_PERMISSIONS.certificates.filter((p) => p !== 'Purge'),
  storage: LEGACY_KEY_VAULT_PERMISSIONS.storage.filter((p) => p !== 'Purge'),
};
