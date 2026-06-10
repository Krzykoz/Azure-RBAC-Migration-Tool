import React, { useRef, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { AlertTriangleIcon } from './Icons';
import { CoverageChartDatum } from '../utils/identityGrouping';
import {
    CHART_BAR_GAP,
    CHART_BAR_WIDTH,
    CHART_BAND,
    CoverageSegmentType,
    activeCoverageSegments,
    coverageLabelPlacement,
    coverageOverviewStats,
    coverageSegmentStyle,
} from '../utils/chartPresentation';

// Custom Shape to handle Centering + Animation
const CenteredBar = (props: any) => {
    const { x, y, width, height, payload, type, barWidth, gap } = props;

    // Active segments (in canonical order), shared with the HTML export.
    const metrics = activeCoverageSegments(payload).map((s) => s.type);

    const myIndex = metrics.indexOf(type);
    if (myIndex === -1) return null; // Don't render if 0% or invalid

    // Calculate Geometry
    const totalGroupWidth = (metrics.length * barWidth) + ((metrics.length - 1) * gap);

    // Determine Center of the Slot based on the "Standard Layout" assumption
    // Recharts places bars at: x = SlotStartX + (Index * (Width + Gap))
    // Standard Order: Coverage (0), Excess (1), Missing (2)
    // We reverse engineer the Slot Center from the provided 'x' which corresponds to the current 'type's standard position.

    let defaultIndex = 0;
    if (type === 'excess') defaultIndex = 1;
    if (type === 'missing') defaultIndex = 2;

    const standardOffset = defaultIndex * (barWidth + gap);
    // x is where Recharts put THIS bar. So SlotStart = x - standardOffset
    const slotStartX = x - standardOffset;

    // We want the group of *active* bars to be centered in the "Band"
    // Recharts BandWidth isn't directly passed easily, but we can assume the band is wide enough 
    // or calculate from standard 3-bar width.
    // Standard 3-bar width = 3*20 + 2*2 = 64.
    // Let's assume the Recharts allocated slot is sized for 3 bars.
    const fullSlotWidth = (3 * barWidth) + (2 * gap);

    const slotCenterX = slotStartX + fullSlotWidth / 2;

    // New Start X for the centered group
    const groupStartX = slotCenterX - totalGroupWidth / 2;
    const myNewX = groupStartX + (myIndex * (barWidth + gap));

    // Colors (shared with the HTML export): label fill is a darker tint, while
    // the halo stroke matches the bar color.
    const style = coverageSegmentStyle(type as CoverageSegmentType);
    const fill = style.bar;
    const textFill = style.label;
    const textStroke = style.bar;

    // Label Logic (placement shared with the HTML export; always rotated -90°).
    const value = payload[`${type}Pct`];
    const text = value > 0 ? `${value}%` : '';

    const place = coverageLabelPlacement(myNewX, y, height, barWidth);
    const labelX = place.x;
    const labelY = place.y;
    const anchor = place.anchor;
    const baseline = place.baseline;

    return (
        <g>
            <path d={`M${myNewX},${y} a2,2 0 0 1 2,-2 h${barWidth - 4} a2,2 0 0 1 2,2 v${height} h-${barWidth} z`} fill={fill} />
            {text && (
                <text
                    x={labelX}
                    y={labelY}
                    fill={textFill}
                    stroke={textStroke}
                    strokeWidth={3}
                    style={{ paintOrder: 'stroke fill' }}
                    fontSize={12}
                    fontWeight={900}
                    textAnchor={anchor as any}
                    dominantBaseline={baseline as any}
                    transform={`rotate(-90, ${labelX}, ${labelY})`}
                >
                    {text}
                </text>
            )}
        </g>
    );
};

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        const data = payload[0].payload;
        return (
            <div className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 p-3 rounded shadow-fluent text-xs z-50 max-w-[250px]">
                <p className="font-bold text-neutral-900 dark:text-white mb-2 truncate">{label}</p>
                <div className="space-y-1">
                    <p className="text-neutral-700 dark:text-neutral-300">
                        Strategy: <span className="font-semibold text-brand-600 dark:text-brand-400">{data.strategy}</span>
                    </p>
                    <p className="text-neutral-700 dark:text-neutral-300">
                        Coverage: <span className={`font-semibold ${data.coveragePct > 80 ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>{data.coveragePct}%</span>
                    </p>
                    <p className="text-neutral-700 dark:text-neutral-300">
                        Role: <span className="font-mono text-[10px]">{data.role}</span>
                    </p>
                    {data.missingPct > 0 && (
                        <p className="text-red-600 dark:text-red-400 flex items-center gap-1">
                            <AlertTriangleIcon className="w-3 h-3" /> {data.missingPct}% Missing ({data.rawMissing})
                        </p>
                    )}
                    {data.excessPct > 0 && (
                        <p className="text-amber-600 dark:text-amber-400">
                            + {data.excessPct}% Excess ({data.rawExcess})
                        </p>
                    )}
                </div>
            </div>
        );
    }
    return null;
};

interface CoverageChartProps {
    data: CoverageChartDatum[];
    theme: 'light' | 'dark';
}

export const CoverageChart: React.FC<CoverageChartProps> = ({ data, theme }) => {
    // Ref and handler for horizontal scroll on mouse wheel
    const chartScrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = chartScrollRef.current;
        if (!el) return;

        const handleWheel = (e: WheelEvent) => {
            if (el.scrollWidth > el.clientWidth) {
                e.preventDefault();
                el.scrollLeft += e.deltaY;
            }
        };

        el.addEventListener('wheel', handleWheel, { passive: false });
        return () => el.removeEventListener('wheel', handleWheel);
    }, []);

    const stats = coverageOverviewStats(data);

    return (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="md:col-span-3 bg-neutral-50 dark:bg-neutral-900/30 p-4 rounded border border-neutral-200 dark:border-neutral-700" style={{ height: '392px' }}>
                <h4 className="text-xs font-semibold text-neutral-700 dark:text-neutral-400 uppercase tracking-wider mb-4">Coverage Distribution</h4>
                <div
                    ref={chartScrollRef}
                    className="overflow-x-auto overflow-y-hidden h-[calc(100%-24px)]"
                >
                    <div style={{ width: data.length * CHART_BAND + 64, height: '100%', margin: '0 auto' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" strokeOpacity={0.3} />
                                <XAxis
                                    dataKey="name"
                                    stroke="#9ca3af"
                                    fontSize={10}
                                    tickLine={false}
                                    axisLine={false}
                                    interval={0}
                                    angle={-45}
                                    textAnchor="end"
                                    height={80}
                                    tickFormatter={(value) => value.length > 12 ? `${value.substring(0, 12)}...` : value}
                                />
                                <YAxis stroke="#9ca3af" fontSize={10} tickLine={false} axisLine={false} unit="%" />
                                <Tooltip
                                    content={<CustomTooltip />}
                                    cursor={{ fill: theme === 'dark' ? '#374151' : '#e5e7eb', opacity: 0.2 }}
                                />
                                <Bar
                                    dataKey="coveragePct"
                                    shape={(props: any) => <CenteredBar {...props} type="coverage" barWidth={CHART_BAR_WIDTH} gap={CHART_BAR_GAP} />}
                                    barSize={CHART_BAR_WIDTH}
                                    isAnimationActive={true}
                                />
                                <Bar
                                    dataKey="excessPct"
                                    shape={(props: any) => <CenteredBar {...props} type="excess" barWidth={CHART_BAR_WIDTH} gap={CHART_BAR_GAP} />}
                                    barSize={CHART_BAR_WIDTH}
                                    isAnimationActive={true}
                                />
                                <Bar
                                    dataKey="missingPct"
                                    shape={(props: any) => <CenteredBar {...props} type="missing" barWidth={CHART_BAR_WIDTH} gap={CHART_BAR_GAP} />}
                                    barSize={CHART_BAR_WIDTH}
                                    isAnimationActive={true}
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>


            <div className="md:col-span-1 space-y-4">
                <div className="bg-white dark:bg-neutral-800 p-5 rounded border border-neutral-200 dark:border-neutral-700 shadow-sm flex flex-col justify-center h-[120px]">
                    <div className="text-3xl font-light text-neutral-900 dark:text-white">
                        {stats.avgCoverage}%
                    </div>
                    <div className="text-xs font-medium text-neutral-700 dark:text-neutral-400 mt-1">Average Coverage</div>
                </div>
                <div className="bg-white dark:bg-neutral-800 p-5 rounded border border-neutral-200 dark:border-neutral-700 shadow-sm flex flex-col justify-center h-[120px]">
                    <div className="text-3xl font-light text-neutral-900 dark:text-white">
                        {stats.totalMissing}
                    </div>
                    <div className="text-xs font-medium text-neutral-700 dark:text-neutral-400 mt-1">Total Missing Permissions</div>
                </div>
                <div className="bg-white dark:bg-neutral-800 p-5 rounded border border-neutral-200 dark:border-neutral-700 shadow-sm flex flex-col justify-center h-[120px]">
                    <div className="text-3xl font-light text-neutral-900 dark:text-white">
                        {stats.totalExcess}
                    </div>
                    <div className="text-xs font-medium text-neutral-700 dark:text-neutral-400 mt-1">Total Excess Permissions</div>
                </div>
            </div>
        </div>
    );
};
