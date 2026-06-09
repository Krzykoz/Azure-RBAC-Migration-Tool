import React, { useMemo } from 'react';
import { MigrationAnalysis } from '../types';
import { CheckCircleIcon, AlertTriangleIcon } from './Icons';
import { PermissionVisualizer } from './PermissionVisualizer';
import { pickRecommendedIndex } from '../utils/recommendationPicker';

export const EmptyHint: React.FC<{ text: string }> = ({ text }) => (
    <div className="p-4 rounded border border-dashed border-neutral-300 dark:border-neutral-700 text-sm text-neutral-500 dark:text-neutral-400 text-center">
        {text}
    </div>
);

export const ManualResults: React.FC<{ result: MigrationAnalysis }> = ({ result }) => {
    const recommendedIdx = useMemo(
        () => pickRecommendedIndex(result.recommendations),
        [result]
    );

    const hasAnyMatch = result.recommendations.some((r) => r.roleNames.length > 0);

    if (!hasAnyMatch) {
        return (
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900 rounded text-sm text-amber-700 dark:text-amber-300 flex items-center gap-2">
                <AlertTriangleIcon className="w-4 h-4" /> No matching roles were found for this
                selection from the chosen role source.
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {result.recommendations.map((rec, idx) => {
                if (rec.roleNames.length === 0) return null;
                const isRecommended = idx === recommendedIdx;
                return (
                    <div
                        key={`${rec.strategy}-${idx}`}
                        className={`rounded border p-4 ${
                            isRecommended
                                ? 'border-brand-600 bg-brand-50/40 dark:bg-brand-900/10'
                                : 'border-neutral-200 dark:border-neutral-700'
                        }`}
                    >
                        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-neutral-900 dark:text-white">
                                    {rec.roleNames.join(' + ')}
                                </span>
                                {isRecommended && (
                                    <span className="text-[10px] uppercase font-bold tracking-wide bg-brand-600 text-white px-2 py-0.5 rounded flex items-center gap-1">
                                        <CheckCircleIcon className="w-3 h-3" /> Recommended
                                    </span>
                                )}
                            </div>
                            <span className="text-xs text-neutral-500">{rec.strategy}</span>
                        </div>

                        <div className="grid grid-cols-3 gap-3 mb-3">
                            <Metric
                                label="Coverage"
                                value={`${rec.confidence}%`}
                                tone={rec.confidence >= 80 ? 'good' : 'warn'}
                            />
                            <Metric
                                label="Excess"
                                value={`${rec.excessPermissions.length}`}
                                tone={rec.excessPermissions.length === 0 ? 'good' : 'warn'}
                            />
                            <Metric
                                label="Missing"
                                value={`${rec.missingPermissions.length}`}
                                tone={rec.missingPermissions.length === 0 ? 'good' : 'bad'}
                            />
                        </div>

                        <PermissionVisualizer
                            breakdown={rec.roleBreakdown}
                            missing={rec.missingPermissions}
                        />
                    </div>
                );
            })}
        </div>
    );
};

const Metric: React.FC<{ label: string; value: string; tone: 'good' | 'warn' | 'bad' }> = ({
    label,
    value,
    tone,
}) => {
    const toneClass =
        tone === 'good'
            ? 'text-green-600 dark:text-green-400'
            : tone === 'warn'
            ? 'text-amber-600 dark:text-amber-400'
            : 'text-red-600 dark:text-red-400';
    return (
        <div className="p-2 rounded bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-700 text-center">
            <div className={`text-lg font-semibold ${toneClass}`}>{value}</div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                {label}
            </div>
        </div>
    );
};
