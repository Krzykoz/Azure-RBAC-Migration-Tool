import { AccessPolicyEntry, MigrationAnalysis } from '../types';

/**
 * A single Key Vault can contain multiple access-policy entries that share an `objectId`
 * but differ by `applicationId` (compound identities). Keying per-row UI/selection state on
 * `objectId` alone makes those rows collide. Use this stable composite key instead.
 */
export const getPolicyKey = (
  policy: Pick<AccessPolicyEntry, 'objectId' | 'applicationId'>
): string => `${policy.objectId}::${policy.applicationId ?? ''}`;

/** The user's chosen recommendation for a result, falling back to the first. */
export const selectedRecommendationIndex = (
  analysis: MigrationAnalysis,
  selectedRoles: Record<string, number>
): number => {
  const index = selectedRoles[getPolicyKey(analysis.originalPolicy)] ?? 0;
  return analysis.recommendations[index] ? index : 0;
};
