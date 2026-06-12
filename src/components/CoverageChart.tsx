import { createSignal, For, Show, onMount, onCleanup, type JSX } from 'solid-js';
import { AlertTriangleIcon } from './Icons';
import { CoverageChartDatum } from '../utils/identityGrouping';
import {
    CHART_BAND,
    CHART_BAR_WIDTH,
    CHART_BAR_GAP,
    activeCoverageSegments,
    coverageGroupWidth,
    coverageLabelPlacement,
    coverageOverviewStats,
} from '../utils/chartPresentation';

// Plot geometry. These paddings make the SVG exactly fill the live chart's
// container (368px tall, data.length * CHART_BAND + 64 wide), matching the layout
// the HTML export already renders from the same chartPresentation helpers.
const LEFT_PAD = 44;
const TOP_PAD = 12;
const PLOT_H = 260;
const BOTTOM_PAD = 96;
const BASE_Y = TOP_PAD + PLOT_H;
const HEIGHT = TOP_PAD + PLOT_H + BOTTOM_PAD;

interface CoverageChartProps {
    data: CoverageChartDatum[];
    theme: 'light' | 'dark';
}

export const CoverageChart = (props: CoverageChartProps): JSX.Element => {
    let scrollRef: HTMLDivElement | undefined;
    const [hovered, setHovered] = createSignal<number | null>(null);

    // Translate vertical wheel into horizontal scroll over the chart strip.
    onMount(() => {
        const el = scrollRef;
        if (!el) return;
        const handleWheel = (e: WheelEvent) => {
            if (el.scrollWidth > el.clientWidth) {
                e.preventDefault();
                el.scrollLeft += e.deltaY;
            }
        };
        el.addEventListener('wheel', handleWheel, { passive: false });
        onCleanup(() => el.removeEventListener('wheel', handleWheel));
    });

    const width = () => LEFT_PAD + props.data.length * CHART_BAND + 20;
    const stats = () => coverageOverviewStats(props.data);
    const tooltipLeft = () => {
        const idx = hovered();
        return idx === null ? 0 : LEFT_PAD + idx * CHART_BAND + CHART_BAND / 2;
    };

    return (
        <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div
                class="md:col-span-3 bg-neutral-50 dark:bg-neutral-900/30 p-4 rounded border border-neutral-200 dark:border-neutral-700"
                style={{ height: '392px' }}
            >
                <h4 class="text-xs font-semibold text-neutral-700 dark:text-neutral-400 uppercase tracking-wider mb-4">
                    Coverage Distribution
                </h4>
                <div ref={scrollRef} class="overflow-x-auto overflow-y-hidden h-[calc(100%-24px)]">
                    <div
                        style={{
                            width: `${props.data.length * CHART_BAND + 64}px`,
                            height: '100%',
                            margin: '0 auto',
                            position: 'relative',
                        }}
                    >
                        <svg
                            width={width()}
                            height={HEIGHT}
                            viewBox={`0 0 ${width()} ${HEIGHT}`}
                            role="img"
                            aria-label="Coverage distribution chart"
                            style={{ display: 'block', margin: '0 auto' }}
                        >
                            {/* Y gridlines + ticks */}
                            <For each={[0, 25, 50, 75, 100]}>
                                {(t) => {
                                    const y = BASE_Y - (t / 100) * PLOT_H;
                                    return (
                                        <>
                                            <line
                                                x1={LEFT_PAD}
                                                y1={y}
                                                x2={width() - 10}
                                                y2={y}
                                                stroke="#e5e7eb"
                                                stroke-opacity="0.3"
                                                stroke-dasharray="3 3"
                                            />
                                            <text
                                                x={LEFT_PAD - 6}
                                                y={y + 3}
                                                text-anchor="end"
                                                font-size="10"
                                                fill="#9ca3af"
                                            >
                                                {t}%
                                            </text>
                                        </>
                                    );
                                }}
                            </For>

                            {/* Bands */}
                            <For each={props.data}>
                                {(d, i) => {
                                    const center = LEFT_PAD + i() * CHART_BAND + CHART_BAND / 2;
                                    const metrics = activeCoverageSegments(d);
                                    const startX = center - coverageGroupWidth(metrics.length) / 2;
                                    const label =
                                        d.name.length > 12 ? `${d.name.substring(0, 12)}...` : d.name;
                                    return (
                                        <>
                                            <Show when={hovered() === i()}>
                                                <rect
                                                    x={LEFT_PAD + i() * CHART_BAND}
                                                    y={TOP_PAD}
                                                    width={CHART_BAND}
                                                    height={PLOT_H}
                                                    fill={props.theme === 'dark' ? '#374151' : '#e5e7eb'}
                                                    opacity="0.2"
                                                />
                                            </Show>
                                            <For each={metrics}>
                                                {(m, j) => {
                                                    const x = startX + j() * (CHART_BAR_WIDTH + CHART_BAR_GAP);
                                                    const h = (m.value / 100) * PLOT_H;
                                                    const y = BASE_Y - h;
                                                    const place = coverageLabelPlacement(x, y, h, CHART_BAR_WIDTH);
                                                    return (
                                                        <>
                                                            <rect
                                                                x={x}
                                                                y={y}
                                                                width={CHART_BAR_WIDTH}
                                                                height={h}
                                                                rx="2"
                                                                fill={m.bar}
                                                            />
                                                            <text
                                                                x={place.x}
                                                                y={place.y}
                                                                fill={m.label}
                                                                stroke={m.bar}
                                                                stroke-width="3"
                                                                paint-order="stroke fill"
                                                                font-size="12"
                                                                font-weight="900"
                                                                text-anchor={place.anchor}
                                                                dominant-baseline={place.baseline}
                                                                transform={`rotate(-90, ${place.x}, ${place.y})`}
                                                            >
                                                                {m.value}%
                                                            </text>
                                                        </>
                                                    );
                                                }}
                                            </For>
                                            <text
                                                x={center}
                                                y={BASE_Y + 14}
                                                text-anchor="end"
                                                font-size="10"
                                                fill="#9ca3af"
                                                transform={`rotate(-45, ${center}, ${BASE_Y + 14})`}
                                            >
                                                {label}
                                            </text>
                                            {/* Transparent hover target spanning the band */}
                                            <rect
                                                x={LEFT_PAD + i() * CHART_BAND}
                                                y={TOP_PAD}
                                                width={CHART_BAND}
                                                height={PLOT_H}
                                                fill="transparent"
                                                onMouseEnter={() => setHovered(i())}
                                                onMouseLeave={() =>
                                                    setHovered((h) => (h === i() ? null : h))
                                                }
                                            />
                                        </>
                                    );
                                }}
                            </For>
                        </svg>

                        {/* Hover tooltip */}
                        <Show when={hovered() !== null ? props.data[hovered()!] : null}>
                            {(d) => (
                                <div
                                    class="absolute bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 p-3 rounded shadow-fluent text-xs z-50 max-w-[250px] pointer-events-none"
                                    style={{
                                        left: `${tooltipLeft()}px`,
                                        top: '8px',
                                        transform: 'translateX(-50%)',
                                    }}
                                >
                                    <p class="font-bold text-neutral-900 dark:text-white mb-2 truncate">
                                        {d().name}
                                    </p>
                                    <div class="space-y-1">
                                        <p class="text-neutral-700 dark:text-neutral-300">
                                            Strategy:{' '}
                                            <span class="font-semibold text-brand-600 dark:text-brand-400">
                                                {d().strategy}
                                            </span>
                                        </p>
                                        <p class="text-neutral-700 dark:text-neutral-300">
                                            Coverage:{' '}
                                            <span
                                                class={`font-semibold ${
                                                    d().coveragePct > 80
                                                        ? 'text-green-600 dark:text-green-400'
                                                        : 'text-amber-600 dark:text-amber-400'
                                                }`}
                                            >
                                                {d().coveragePct}%
                                            </span>
                                        </p>
                                        <p class="text-neutral-700 dark:text-neutral-300">
                                            Role: <span class="font-mono text-[10px]">{d().role}</span>
                                        </p>
                                        <Show when={d().missingPct > 0}>
                                            <p class="text-red-600 dark:text-red-400 flex items-center gap-1">
                                                <AlertTriangleIcon class="w-3 h-3" /> {d().missingPct}%
                                                Missing ({d().rawMissing})
                                            </p>
                                        </Show>
                                        <Show when={d().excessPct > 0}>
                                            <p class="text-amber-600 dark:text-amber-400">
                                                + {d().excessPct}% Excess ({d().rawExcess})
                                            </p>
                                        </Show>
                                    </div>
                                </div>
                            )}
                        </Show>
                    </div>
                </div>
            </div>

            <div class="md:col-span-1 space-y-4">
                <div class="bg-white dark:bg-neutral-800 p-5 rounded border border-neutral-200 dark:border-neutral-700 shadow-sm flex flex-col justify-center h-[120px]">
                    <div class="text-3xl font-light text-neutral-900 dark:text-white">
                        {stats().avgCoverage}%
                    </div>
                    <div class="text-xs font-medium text-neutral-700 dark:text-neutral-400 mt-1">
                        Average Coverage
                    </div>
                </div>
                <div class="bg-white dark:bg-neutral-800 p-5 rounded border border-neutral-200 dark:border-neutral-700 shadow-sm flex flex-col justify-center h-[120px]">
                    <div class="text-3xl font-light text-neutral-900 dark:text-white">
                        {stats().totalMissing}
                    </div>
                    <div class="text-xs font-medium text-neutral-700 dark:text-neutral-400 mt-1">
                        Total Missing Permissions
                    </div>
                </div>
                <div class="bg-white dark:bg-neutral-800 p-5 rounded border border-neutral-200 dark:border-neutral-700 shadow-sm flex flex-col justify-center h-[120px]">
                    <div class="text-3xl font-light text-neutral-900 dark:text-white">
                        {stats().totalExcess}
                    </div>
                    <div class="text-xs font-medium text-neutral-700 dark:text-neutral-400 mt-1">
                        Total Excess Permissions
                    </div>
                </div>
            </div>
        </div>
    );
};
