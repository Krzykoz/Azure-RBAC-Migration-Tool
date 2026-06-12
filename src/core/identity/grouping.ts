import { MigrationAnalysis } from '../types';
import { IDENTITY_TYPE_ORDER } from '../constants';
import { getPolicyKey } from './policyKey';
import {
  ResolvedNames,
  IdentityIconKind,
  describeIdentity,
  isCompoundIdentity,
  resolveIdentityType,
} from './identity';

/** The grouping buckets, in canonical display order. */
export type IdentityGroupKey = (typeof IDENTITY_TYPE_ORDER)[number];

export type GroupedResults = Record<IdentityGroupKey, MigrationAnalysis[]>;

const emptyGroups = (): GroupedResults =>
  IDENTITY_TYPE_ORDER.reduce((acc, key) => {
    acc[key] = [];
    return acc;
  }, {} as GroupedResults);

/**
 * Bucket analysis results by identity type. Compound identities take precedence
 * over their underlying principal type; anything unrecognized falls into Unknown.
 */
export const groupResultsByType = (
  results: MigrationAnalysis[],
  resolvedNames: ResolvedNames
): GroupedResults => {
  const groups = emptyGroups();

  results.forEach((res) => {
    if (isCompoundIdentity(res.originalPolicy)) {
      groups.CompoundIdentity.push(res);
      return;
    }
    const type = resolveIdentityType(res.originalPolicy, resolvedNames);
    if (type in groups) {
      groups[type as IdentityGroupKey].push(res);
    } else {
      groups.Unknown.push(res);
    }
  });

  return groups;
};

/** Flatten grouped results into a single list following {@link IDENTITY_TYPE_ORDER}. */
export const flattenInDisplayOrder = (groups: GroupedResults): MigrationAnalysis[] =>
  IDENTITY_TYPE_ORDER.flatMap((key) => groups[key]);

/**
 * The identity sections shown in the results table / export, in display order.
 * A single section may merge several {@link IdentityGroupKey} buckets (e.g.
 * Applications & Service Principals). Shared by the live results view and the
 * HTML export so section order, labels, and icons stay in lockstep.
 */
export interface IdentityDisplayGroup {
  label: string;
  iconKind: IdentityIconKind;
  /** Grouping buckets merged under this display section. */
  keys: IdentityGroupKey[];
}

export const IDENTITY_DISPLAY_GROUPS: readonly IdentityDisplayGroup[] = [
  {
    label: 'Applications & Service Principals',
    iconKind: 'app',
    keys: ['Application', 'ServicePrincipal'],
  },
  { label: 'Compound Identities', iconKind: 'compound', keys: ['CompoundIdentity'] },
  { label: 'Groups', iconKind: 'group', keys: ['Group'] },
  { label: 'Users', iconKind: 'user', keys: ['User'] },
  { label: 'Unknown Identities', iconKind: 'unknown', keys: ['Unknown'] },
] as const;

/** Collect the results belonging to a display section, in bucket order. */
export const collectDisplayGroup = (
  groups: GroupedResults,
  group: IdentityDisplayGroup
): MigrationAnalysis[] => group.keys.flatMap((key) => groups[key]);

export interface CoverageChartDatum {
  name: string;
  coveragePct: number;
  excessPct: number;
  missingPct: number;
  fullScale: number;
  rawMissing: number;
  rawExcess: number;
  role: string;
  strategy?: string;
}

const toPercent = (part: number, whole: number): number =>
  whole > 0 ? Math.round((part / whole) * 100) : 0;

/**
 * Shape ordered results into the data series consumed by the coverage chart.
 * Coverage % is the selected recommendation's confidence; excess/missing % are
 * relative to the role's granted set and the policy's required set respectively.
 */
export const toCoverageChartData = (
  orderedResults: MigrationAnalysis[],
  selectedRoles: Record<string, number>,
  resolvedNames: ResolvedNames
): CoverageChartDatum[] =>
  orderedResults.map((r) => {
    const selectedIdx = selectedRoles[getPolicyKey(r.originalPolicy)] || 0;
    const rec = r.recommendations[selectedIdx];
    const { displayName } = describeIdentity(r.originalPolicy, resolvedNames);

    const covered = rec?.coveredPermissions?.length || 0;
    const missing = rec?.missingPermissions?.length || 0;
    const excess = rec?.excessPermissions?.length || 0;

    return {
      name: displayName || r.originalPolicy.objectId.substring(0, 8),
      coveragePct: rec?.confidence || 0,
      excessPct: toPercent(excess, covered + excess),
      missingPct: toPercent(missing, covered + missing),
      fullScale: 100,
      rawMissing: missing,
      rawExcess: excess,
      role: rec?.roleName || 'None',
      strategy: rec?.strategy,
    };
  });
