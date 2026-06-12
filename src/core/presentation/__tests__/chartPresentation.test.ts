import { describe, it, expect } from 'vitest';
import { CoverageChartDatum } from '../../identity/grouping';
import {
    CHART_BAR_GAP,
    CHART_BAR_WIDTH,
    CHART_LABEL_INSIDE_MIN_HEIGHT,
    COVERAGE_SEGMENT_STYLES,
    activeCoverageSegments,
    coverageGroupWidth,
    coverageLabelPlacement,
    coverageOverviewStats,
    coverageSegmentStyle,
} from '../chartPresentation';

const datum = (over: Partial<CoverageChartDatum>): CoverageChartDatum => ({
    name: 'id',
    coveragePct: 0,
    excessPct: 0,
    missingPct: 0,
    fullScale: 100,
    rawMissing: 0,
    rawExcess: 0,
    role: 'role',
    ...over,
});

describe('COVERAGE_SEGMENT_STYLES', () => {
    it('lists coverage, excess, missing in canonical order with matching value keys', () => {
        expect(COVERAGE_SEGMENT_STYLES.map((s) => s.type)).toEqual(['coverage', 'excess', 'missing']);
        expect(COVERAGE_SEGMENT_STYLES.map((s) => s.valueKey)).toEqual([
            'coveragePct',
            'excessPct',
            'missingPct',
        ]);
    });
});

describe('coverageSegmentStyle', () => {
    it('returns the style for a given type', () => {
        expect(coverageSegmentStyle('coverage').bar).toBe('#107c10');
        expect(coverageSegmentStyle('excess').label).toBe('#cc7a00');
        expect(coverageSegmentStyle('missing').bar).toBe('#d13438');
    });
});

describe('activeCoverageSegments', () => {
    it('keeps only segments with value > 0, in canonical order, with values attached', () => {
        const segs = activeCoverageSegments(datum({ coveragePct: 80, excessPct: 0, missingPct: 20 }));
        expect(segs.map((s) => s.type)).toEqual(['coverage', 'missing']);
        expect(segs.map((s) => s.value)).toEqual([80, 20]);
    });

    it('returns an empty list when every segment is zero', () => {
        expect(activeCoverageSegments(datum({}))).toEqual([]);
    });
});

describe('coverageGroupWidth', () => {
    it('accounts for bar widths and the gaps between them', () => {
        expect(coverageGroupWidth(1)).toBe(CHART_BAR_WIDTH);
        expect(coverageGroupWidth(3)).toBe(3 * CHART_BAR_WIDTH + 2 * CHART_BAR_GAP);
        expect(coverageGroupWidth(0)).toBe(0);
    });
});

describe('coverageOverviewStats', () => {
    it('averages coverage and sums raw missing/excess', () => {
        const data = [
            datum({ coveragePct: 100, rawMissing: 0, rawExcess: 4 }),
            datum({ coveragePct: 50, rawMissing: 3, rawExcess: 1 }),
        ];
        expect(coverageOverviewStats(data)).toEqual({
            avgCoverage: 75,
            totalMissing: 3,
            totalExcess: 5,
        });
    });

    it('does not divide by zero for empty input', () => {
        expect(coverageOverviewStats([])).toEqual({
            avgCoverage: 0,
            totalMissing: 0,
            totalExcess: 0,
        });
    });
});

describe('chart geometry constants', () => {
    it('exposes sane defaults shared by both renderers', () => {
        expect(CHART_BAR_WIDTH).toBeGreaterThan(0);
        expect(CHART_BAR_GAP).toBeGreaterThanOrEqual(0);
        expect(CHART_LABEL_INSIDE_MIN_HEIGHT).toBeGreaterThan(0);
    });
});

describe('coverageLabelPlacement', () => {
    it('centers the label inside a tall bar', () => {
        const tall = CHART_LABEL_INSIDE_MIN_HEIGHT + 50;
        const place = coverageLabelPlacement(100, 10, tall, 20);
        expect(place).toEqual({
            x: 110,
            y: 10 + tall / 2,
            anchor: 'middle',
            baseline: 'middle',
            inside: true,
        });
    });

    it('anchors the label at the base of a short bar so it rises out of the bar', () => {
        const short = 12;
        const place = coverageLabelPlacement(100, 240, short, 20);
        expect(place).toEqual({
            x: 110,
            y: 240 + short - 5,
            anchor: 'start',
            baseline: 'central',
            inside: false,
        });
    });

    it('treats the threshold height as short (inside requires strictly greater)', () => {
        expect(coverageLabelPlacement(0, 0, CHART_LABEL_INSIDE_MIN_HEIGHT, 20).inside).toBe(false);
    });

    it('defaults the bar width to the shared constant', () => {
        expect(coverageLabelPlacement(0, 0, 100).x).toBe(CHART_BAR_WIDTH / 2);
    });
});
