import React from 'react';
import { CoverageChartDatum } from '../../core/identity/grouping';

/** One identity's bars: a datum per strategy, of which only the selected one is visible. */
export interface ChartRow {
  rowId: string;
  selectedIdx: number;
  data: CoverageChartDatum[];
}

const SEGMENTS = [
  { key: 'coveragePct', bar: '#107c10', label: '#0b5a0b' },
  { key: 'excessPct', bar: '#ffaa44', label: '#cc7a00' },
  { key: 'missingPct', bar: '#d13438', label: '#a31a1e' },
] as const;

const BAND = 80;
const BAR = 20;
const GAP = 2;
const LEFT = 44;
const TOP = 12;
const PLOT = 260;
const BASE = TOP + PLOT;
const HEIGHT = BASE + 96;

const Bars: React.FC<{ datum: CoverageChartDatum; center: number }> = ({ datum, center }) => {
  const active = SEGMENTS.filter((s) => datum[s.key] > 0);
  const start = center - (active.length * (BAR + GAP) - GAP) / 2;
  return active.map((segment, j) => {
    const value = datum[segment.key];
    const x = start + j * (BAR + GAP);
    const height = (value / 100) * PLOT;
    const y = BASE - height;
    // Tall bars center the label inside; short ones start it at the base so it rises out.
    const inside = height > 35;
    const labelX = x + BAR / 2;
    const labelY = inside ? y + height / 2 : y + height - 5;
    return (
      <React.Fragment key={segment.key}>
        <rect x={x} y={y} width={BAR} height={height} rx={2} fill={segment.bar} />
        <text
          x={labelX}
          y={labelY}
          fill={segment.label}
          stroke={segment.bar}
          strokeWidth={3}
          style={{ paintOrder: 'stroke fill' }}
          fontSize={12}
          fontWeight={900}
          textAnchor={inside ? 'middle' : 'start'}
          dominantBaseline={inside ? 'middle' : 'central'}
          transform={`rotate(-90, ${labelX}, ${labelY})`}
        >
          {value}%
        </text>
      </React.Fragment>
    );
  });
};

export const CoverageChart: React.FC<{ rows: ChartRow[] }> = ({ rows }) => {
  const width = Math.max(LEFT + rows.length * BAND + 20, 320);
  const selected = rows.map((row) => row.data[row.selectedIdx]);
  const sum = (key: 'coveragePct' | 'rawMissing' | 'rawExcess') => selected.reduce((total, d) => total + d[key], 0);
  // The ids let the standalone report's script update these after a strategy switch.
  const stats = [
    { id: 'stat-average', value: `${Math.round(sum('coveragePct') / (selected.length || 1))}%`, label: 'Average Coverage' },
    { id: 'stat-missing', value: sum('rawMissing'), label: 'Total Missing Permissions' },
    { id: 'stat-excess', value: sum('rawExcess'), label: 'Total Excess Permissions' },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-4">
      <div className="min-w-0 rounded border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-900/30 sm:p-4 lg:col-span-3">
        <h4 className="text-xs font-semibold text-neutral-700 dark:text-neutral-400 uppercase tracking-wider mb-4">Coverage Distribution</h4>
        <div className="overflow-x-auto overflow-y-hidden">
          <svg width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} role="img" aria-label="Coverage distribution chart" className="mx-auto block">
            {[0, 25, 50, 75, 100].map((tick) => {
              const y = BASE - (tick / 100) * PLOT;
              return (
                <g key={tick}>
                  <line x1={LEFT} y1={y} x2={width - 10} y2={y} strokeDasharray="3 3" className="stroke-neutral-200 dark:stroke-neutral-700" />
                  <text x={LEFT - 6} y={y + 3} textAnchor="end" fontSize={10} className="fill-neutral-600 dark:fill-neutral-400">{tick}%</text>
                </g>
              );
            })}
            {rows.map((row, i) => {
              const center = LEFT + i * BAND + BAND / 2;
              return row.data.map((d, idx) => (
                <g
                  key={`${row.rowId}-${idx}`}
                  data-row={row.rowId}
                  data-idx={idx}
                  data-coverage={d.coveragePct}
                  data-missing={d.rawMissing}
                  data-excess={d.rawExcess}
                  // Same `hidden` toggle as the HTML panels; React's SVG types just omit the attribute.
                  {...{ hidden: idx !== row.selectedIdx }}
                >
                  <title>{`${d.name}\n${d.strategy ?? 'No recommendation'}: ${d.role}\nCoverage ${d.coveragePct}% · Missing ${d.rawMissing} · Excess ${d.rawExcess}`}</title>
                  <Bars datum={d} center={center} />
                  <text
                    x={center}
                    y={BASE + 14}
                    textAnchor="end"
                    fontSize={10}
                    className="fill-neutral-600 dark:fill-neutral-400"
                    transform={`rotate(-45, ${center}, ${BASE + 14})`}
                  >
                    {d.name.length > 12 ? `${d.name.substring(0, 12)}...` : d.name}
                  </text>
                </g>
              ));
            })}
          </svg>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:col-span-1 lg:grid-cols-1 lg:gap-4">
        {stats.map((stat) => (
          <div key={stat.id} className="bg-white dark:bg-neutral-800 p-4 lg:p-5 rounded border border-neutral-200 dark:border-neutral-700 shadow-sm flex flex-col justify-center h-24 lg:h-auto">
            <div id={stat.id} className="text-3xl font-light text-neutral-900 dark:text-white">{stat.value}</div>
            <div className="text-xs font-medium text-neutral-700 dark:text-neutral-400 mt-1">{stat.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
};
