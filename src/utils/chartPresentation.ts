import { CoverageChartDatum } from './identityGrouping';

/**
 * Single source of truth for the Coverage Distribution chart's colors, geometry
 * and derived stats. Both the live chart (`CoverageChart`) and the static export
 * (`htmlExport`), each drawn as raw SVG, consume these so the two renderings
 * can't drift apart.
 */

export type CoverageSegmentType = 'coverage' | 'excess' | 'missing';

export interface CoverageSegmentStyle {
    type: CoverageSegmentType;
    /** The `CoverageChartDatum` field holding this segment's percentage. */
    valueKey: 'coveragePct' | 'excessPct' | 'missingPct';
    /** Bar fill, and the label's outline/halo color. */
    bar: string;
    /** Label text fill (a darker tint of the bar color). */
    label: string;
}

/**
 * Segment styles in canonical left-to-right order. Order is significant: both
 * renderers lay the active bars out in this sequence within each band.
 */
export const COVERAGE_SEGMENT_STYLES: CoverageSegmentStyle[] = [
    { type: 'coverage', valueKey: 'coveragePct', bar: '#107c10', label: '#0b5a0b' },
    { type: 'excess', valueKey: 'excessPct', bar: '#ffaa44', label: '#cc7a00' },
    { type: 'missing', valueKey: 'missingPct', bar: '#d13438', label: '#a31a1e' },
];

export interface ActiveCoverageSegment extends CoverageSegmentStyle {
    value: number;
}

/** The active (value > 0) segments for a datum, in canonical order. */
export const activeCoverageSegments = (d: CoverageChartDatum): ActiveCoverageSegment[] =>
    COVERAGE_SEGMENT_STYLES.map((s) => ({ ...s, value: d[s.valueKey] })).filter((s) => s.value > 0);

/** Look up a single segment's style by type. */
export const coverageSegmentStyle = (type: CoverageSegmentType): CoverageSegmentStyle =>
    COVERAGE_SEGMENT_STYLES.find((s) => s.type === type) as CoverageSegmentStyle;

// --- Shared geometry --------------------------------------------------------
/** Width of a single bar, in px. */
export const CHART_BAR_WIDTH = 20;
/** Gap between adjacent bars within a band, in px. */
export const CHART_BAR_GAP = 2;
/** Horizontal space allotted per identity (band), in px. */
export const CHART_BAND = 80;
/** Taller bars center the % label inside; shorter ones anchor it at the base. */
export const CHART_LABEL_INSIDE_MIN_HEIGHT = 35;

/** Total width of a centered group of `segmentCount` bars. */
export const coverageGroupWidth = (segmentCount: number): number =>
    segmentCount * CHART_BAR_WIDTH + Math.max(0, segmentCount - 1) * CHART_BAR_GAP;

export interface CoverageLabelPlacement {
    x: number;
    y: number;
    anchor: 'start' | 'middle' | 'end';
    baseline: 'middle' | 'central';
    /** True when the label sits inside a tall bar (vs. rising from a short one). */
    inside: boolean;
}

/**
 * Placement for a bar's percentage label. The label is always rotated -90°; this
 * only decides where it is anchored. Tall bars center it inside; short bars anchor
 * it near the bar's base so the rotated text rises up out of the bar. Shared by the
 * live chart and the HTML export so small-bar labels render identically in both.
 *
 * `barX`/`barTopY` are the bar's top-left corner and `barHeight` its drawn height.
 */
export const coverageLabelPlacement = (
    barX: number,
    barTopY: number,
    barHeight: number,
    barWidth: number = CHART_BAR_WIDTH
): CoverageLabelPlacement => {
    const x = barX + barWidth / 2;
    if (barHeight > CHART_LABEL_INSIDE_MIN_HEIGHT) {
        return { x, y: barTopY + barHeight / 2, anchor: 'middle', baseline: 'middle', inside: true };
    }
    return { x, y: barTopY + barHeight - 5, anchor: 'start', baseline: 'central', inside: false };
};

// --- Derived summary stats --------------------------------------------------
export interface CoverageOverviewStats {
    avgCoverage: number;
    totalMissing: number;
    totalExcess: number;
}

/** The three summary-card values shown beside the chart. */
export const coverageOverviewStats = (data: CoverageChartDatum[]): CoverageOverviewStats => ({
    avgCoverage: Math.round(data.reduce((acc, c) => acc + c.coveragePct, 0) / (data.length || 1)),
    totalMissing: data.reduce((acc, c) => acc + c.rawMissing, 0),
    totalExcess: data.reduce((acc, c) => acc + c.rawExcess, 0),
});
