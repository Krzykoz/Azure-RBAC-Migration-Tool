import { ExistingCoverageResult, RoleBreakdown } from '../types';

/**
 * Presentation-logic shared between the live analysis view and the static HTML
 * export. These are pure decision helpers ("what state should be shown") with no
 * rendering attached, so the React components and the export string-builder make
 * identical choices about confidence levels, coverage badges, and banners.
 */

export type ConfidenceLevel = 'high' | 'mid' | 'low';

/** Bucket a 0-100 confidence score into the three display tiers. */
export const confidenceLevel = (confidence: number): ConfidenceLevel =>
    confidence > 80 ? 'high' : confidence > 50 ? 'mid' : 'low';

export type ExistingCoverageBadge = 'covered' | 'partial' | null;

/**
 * The small inline badge shown next to an identity: fully covered by existing
 * RBAC, partially covered (some required permissions already granted), or none.
 */
export const existingCoverageBadge = (
    coverage: ExistingCoverageResult | undefined
): ExistingCoverageBadge => {
    if (!coverage) return null;
    if (coverage.isFullyCovered) return 'covered';
    if (coverage.coveredPermissions.length > 0) return 'partial';
    return null;
};

export type CoverageBannerKind = 'full' | 'partial' | 'none';

/**
 * The Gap-Analysis banner state: a green "Fully Covered" banner, a blue
 * "Partially Covered" banner (only when existing roles match something), or no
 * banner at all.
 */
export const coverageBannerKind = (
    coverage: ExistingCoverageResult | undefined
): CoverageBannerKind => {
    if (!coverage) return 'none';
    if (coverage.isFullyCovered) return 'full';
    if (coverage.roleMatches.length > 0) return 'partial';
    return 'none';
};

/** Existing role matches reshaped as `RoleBreakdown[]` for the permission visualizer. */
export const roleMatchesToBreakdown = (coverage: ExistingCoverageResult): RoleBreakdown[] =>
    coverage.roleMatches.map((rm) => ({
        roleName: rm.roleName,
        covered: rm.covered,
        excess: rm.excess,
    }));

/**
 * Whether to show the green "Complete Coverage" indicator: the selected
 * recommendation leaves nothing missing and the identity isn't already fully
 * covered by existing RBAC (which has its own banner).
 */
export const showsCompleteCoverage = (
    missingCount: number,
    coverage: ExistingCoverageResult | undefined
): boolean => missingCount === 0 && !coverage?.isFullyCovered;
