import { AccessPolicyEntry, IdentityType } from '../types';

/**
 * Single source of truth for how a legacy access-policy identity is interpreted
 * and displayed: compound detection, "on behalf of (App)" naming, and the
 * Graph → ARM → Unknown type-resolution precedence. Every renderer (live view,
 * exporters, charts) goes through these helpers so they cannot drift apart.
 */

export type ResolvedNames = Record<string, { name: string; type: IdentityType }>;

const COMPOUND_IDENTITY_LABEL = 'Compound Identity' as const;
type DisplayIdentityType = IdentityType | typeof COMPOUND_IDENTITY_LABEL;

/**
 * A compound identity is a service principal acting on behalf of an application:
 * it carries both an `objectId` and a non-empty `applicationId`.
 */
export const isCompoundIdentity = (
  policy: Pick<AccessPolicyEntry, 'applicationId'>
): boolean => !!policy.applicationId && policy.applicationId.trim() !== '';

/**
 * Resolve the principal's type with the standard precedence:
 * Graph resolution → ARM/policy-supplied type → 'Unknown'.
 * This does NOT collapse compound identities; callers that need the
 * "Compound Identity" label use {@link displayIdentityType}.
 */
export const resolveIdentityType = (
  policy: Pick<AccessPolicyEntry, 'objectId' | 'type'>,
  resolvedNames: ResolvedNames
): IdentityType => resolvedNames[policy.objectId]?.type || policy.type || 'Unknown';

/** The type to show/group by, collapsing compound identities to a single label. */
export const displayIdentityType = (
  policy: Pick<AccessPolicyEntry, 'objectId' | 'type' | 'applicationId'>,
  resolvedNames: ResolvedNames
): DisplayIdentityType =>
  isCompoundIdentity(policy)
    ? COMPOUND_IDENTITY_LABEL
    : resolveIdentityType(policy, resolvedNames);

/** Canonical icon bucket for an identity, decoupled from any specific renderer. */
export type IdentityIconKind = 'compound' | 'user' | 'group' | 'app' | 'unknown';

/**
 * Map a (compound, resolved-type) pair to the canonical icon bucket. Both the
 * live view (React icon components) and the HTML export (inline SVG paths) map
 * this single decision to their own icon set so they always match.
 */
export const identityIconKind = (compound: boolean, type: IdentityType): IdentityIconKind => {
  if (compound) return 'compound';
  if (type === 'User') return 'user';
  if (type === 'Group') return 'group';
  if (type === 'ServicePrincipal' || type === 'Application') return 'app';
  return 'unknown';
};

/** Whether the raw object id should be shown as a sub-line beneath a resolved name. */
export const shouldShowObjectIdSeparately = (
  displayName: string | undefined,
  objectId: string
): boolean => !!displayName && displayName !== objectId;

/**
 * Resolve the backing application's display name for a compound identity,
 * falling back to the raw applicationId. Returns undefined for non-compound.
 */
export const resolveAppName = (
  policy: Pick<AccessPolicyEntry, 'applicationId'>,
  resolvedNames: ResolvedNames
): string | undefined => {
  if (!isCompoundIdentity(policy)) return undefined;
  const appId = policy.applicationId!;
  return resolvedNames[appId]?.name || appId;
};

interface IdentityDescriptor {
  /**
   * Resolved display name with the "on behalf of (App)" suffix applied for
   * compound identities. `undefined` when no name could be resolved and no
   * fallback was provided (callers then render the raw objectId).
   */
  displayName: string | undefined;
  /** Raw resolved principal type (not collapsed to the compound label). */
  type: IdentityType;
  isCompound: boolean;
  /** Resolved application name for compound identities. */
  appName?: string;
}

/**
 * Produce the canonical display descriptor for an identity.
 *
 * @param options.fallbackName when set (e.g. 'Unknown' for exports), used as the
 * base name if nothing resolves — which also means the "on behalf of" suffix is
 * always applied for compound identities. When omitted (UI views), an
 * unresolved identity yields `displayName: undefined` and no suffix, so the raw
 * objectId is shown instead.
 */
export const describeIdentity = (
  policy: AccessPolicyEntry,
  resolvedNames: ResolvedNames,
  options: { fallbackName?: string } = {}
): IdentityDescriptor => {
  const isCompound = isCompoundIdentity(policy);
  const type = resolveIdentityType(policy, resolvedNames);
  const appName = resolveAppName(policy, resolvedNames);

  const baseName =
    resolvedNames[policy.objectId]?.name || policy.displayName || options.fallbackName;

  const displayName =
    isCompound && baseName ? `${baseName} on behalf of (${appName})` : baseName;

  return { displayName, type, isCompound, appName };
};
