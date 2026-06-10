import { describe, it, expect } from 'vitest';
import {
    confidenceLevel,
    coverageBannerKind,
    existingCoverageBadge,
    roleMatchesToBreakdown,
    showsCompleteCoverage,
} from '../resultPresentation';
import { ExistingCoverageResult } from '../../types';

const coverage = (over: Partial<ExistingCoverageResult> = {}): ExistingCoverageResult => ({
    isFullyCovered: false,
    coveredPermissions: [],
    missingPermissions: [],
    excessPermissions: [],
    roleMatches: [],
    ...over,
});

describe('confidenceLevel', () => {
    it('buckets scores at the >80 / >50 thresholds', () => {
        expect(confidenceLevel(100)).toBe('high');
        expect(confidenceLevel(81)).toBe('high');
        expect(confidenceLevel(80)).toBe('mid');
        expect(confidenceLevel(51)).toBe('mid');
        expect(confidenceLevel(50)).toBe('low');
        expect(confidenceLevel(0)).toBe('low');
    });
});

describe('existingCoverageBadge', () => {
    it('returns null when there is no coverage', () => {
        expect(existingCoverageBadge(undefined)).toBeNull();
    });

    it('returns "covered" when fully covered', () => {
        expect(existingCoverageBadge(coverage({ isFullyCovered: true }))).toBe('covered');
    });

    it('returns "partial" when some required permissions are already granted', () => {
        expect(existingCoverageBadge(coverage({ coveredPermissions: ['a'] }))).toBe('partial');
    });

    it('returns null when not covered and nothing is granted yet', () => {
        expect(existingCoverageBadge(coverage())).toBeNull();
    });
});

describe('coverageBannerKind', () => {
    it('returns "none" when there is no coverage', () => {
        expect(coverageBannerKind(undefined)).toBe('none');
    });

    it('returns "full" when fully covered', () => {
        expect(coverageBannerKind(coverage({ isFullyCovered: true }))).toBe('full');
    });

    it('returns "partial" only when there are role matches', () => {
        expect(
            coverageBannerKind(coverage({ roleMatches: [{ roleName: 'R', covered: ['a'], excess: [] }] }))
        ).toBe('partial');
        expect(coverageBannerKind(coverage({ coveredPermissions: ['a'] }))).toBe('none');
    });
});

describe('roleMatchesToBreakdown', () => {
    it('reshapes role matches into RoleBreakdown[]', () => {
        const result = roleMatchesToBreakdown(
            coverage({
                roleMatches: [
                    { roleName: 'Reader', covered: ['a', 'b'], excess: ['c'] },
                    { roleName: 'Writer', covered: ['d'], excess: [] },
                ],
            })
        );
        expect(result).toEqual([
            { roleName: 'Reader', covered: ['a', 'b'], excess: ['c'] },
            { roleName: 'Writer', covered: ['d'], excess: [] },
        ]);
    });
});

describe('showsCompleteCoverage', () => {
    it('is true when nothing is missing and not already fully covered', () => {
        expect(showsCompleteCoverage(0, undefined)).toBe(true);
        expect(showsCompleteCoverage(0, coverage())).toBe(true);
    });

    it('is false when there are missing permissions', () => {
        expect(showsCompleteCoverage(2, undefined)).toBe(false);
    });

    it('is false when already fully covered (its own banner takes over)', () => {
        expect(showsCompleteCoverage(0, coverage({ isFullyCovered: true }))).toBe(false);
    });
});
