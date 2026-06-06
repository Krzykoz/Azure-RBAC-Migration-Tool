import { AccessPolicyEntry } from '../types';

/**
 * A single Key Vault can contain multiple access-policy entries that share an `objectId`
 * but differ by `applicationId` (compound identities). Keying per-row UI/selection state on
 * `objectId` alone makes those rows collide. Use this stable composite key instead.
 */
export const getPolicyKey = (
    policy: Pick<AccessPolicyEntry, 'objectId' | 'applicationId'>
): string => `${policy.objectId}::${policy.applicationId ?? ''}`;
