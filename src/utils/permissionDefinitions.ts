
export const LEGACY_KEY_VAULT_PERMISSIONS: Record<string, string[]> = {
    keys: [
        'Get', 'List', 'Update', 'Create', 'Import', 'Delete', 'Recover', 
        'Backup', 'Restore', 'Decrypt', 'Encrypt', 'UnwrapKey', 'WrapKey', 
        'Verify', 'Sign', 'Purge', 'Release', 'Rotate', 'GetRotationPolicy', 
        'SetRotationPolicy'
    ],
    secrets: [
        'Get', 'List', 'Set', 'Delete', 'Recover', 'Backup', 'Restore', 'Purge'
    ],
    certificates: [
        'Get', 'List', 'Update', 'Create', 'Import', 'Delete', 'Recover', 
        'Backup', 'Restore', 'ManageContacts', 'ManageIssuers', 'GetIssuers', 
        'ListIssuers', 'SetIssuers', 'DeleteIssuers', 'Purge'
    ],
    storage: [
        'Get', 'List', 'Delete', 'Set', 'Update', 'RegenerateKey', 'GetSas', 
        'ListSas', 'DeleteSas', 'SetSas', 'Recover', 'Backup', 'Restore', 'Purge'
    ]
};
