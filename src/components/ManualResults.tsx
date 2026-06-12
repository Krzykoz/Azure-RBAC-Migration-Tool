import { createMemo, Index, Show, type JSX } from 'solid-js';
import { MigrationAnalysis } from '../types';
import { CheckCircleIcon, AlertTriangleIcon } from './Icons';
import { PermissionVisualizer } from './PermissionVisualizer';
import { pickRecommendedIndex } from '../utils/recommendationPicker';

export const EmptyHint = (props: { text: string }): JSX.Element => (
    <div class="p-4 rounded border border-dashed border-neutral-300 dark:border-neutral-700 text-sm text-neutral-500 dark:text-neutral-400 text-center">
        {props.text}
    </div>
);

const Metric = (props: {
    label: string;
    value: string;
    tone: 'good' | 'warn' | 'bad';
}): JSX.Element => {
    const toneClass = () =>
        props.tone === 'good'
            ? 'text-green-600 dark:text-green-400'
            : props.tone === 'warn'
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-red-600 dark:text-red-400';
    return (
        <div class="p-2 rounded bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-700 text-center">
            <div class={`text-lg font-semibold ${toneClass()}`}>{props.value}</div>
            <div class="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                {props.label}
            </div>
        </div>
    );
};

export const ManualResults = (props: { result: MigrationAnalysis }): JSX.Element => {
    const recommendedIdx = createMemo(() => pickRecommendedIndex(props.result.recommendations));
    const hasAnyMatch = createMemo(() =>
        props.result.recommendations.some((r) => r.roleNames.length > 0)
    );

    return (
        <Show
            when={hasAnyMatch()}
            fallback={
                <div class="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900 rounded text-sm text-amber-700 dark:text-amber-300 flex items-center gap-2">
                    <AlertTriangleIcon class="w-4 h-4" /> No matching roles were found for this
                    selection from the chosen role source.
                </div>
            }
        >
            <div class="space-y-4">
                <Index each={props.result.recommendations}>
                    {(rec, idx) => (
                        <Show when={rec().roleNames.length > 0}>
                            <div
                                class={`rounded border p-4 ${
                                    idx === recommendedIdx()
                                        ? 'border-brand-600 bg-brand-50/40 dark:bg-brand-900/10'
                                        : 'border-neutral-200 dark:border-neutral-700'
                                }`}
                            >
                                <div class="flex items-center justify-between flex-wrap gap-2 mb-3">
                                    <div class="flex items-center gap-2">
                                        <span class="text-sm font-semibold text-neutral-900 dark:text-white">
                                            {rec().roleNames.join(' + ')}
                                        </span>
                                        <Show when={idx === recommendedIdx()}>
                                            <span class="text-[10px] uppercase font-bold tracking-wide bg-brand-600 text-white px-2 py-0.5 rounded flex items-center gap-1">
                                                <CheckCircleIcon class="w-3 h-3" /> Recommended
                                            </span>
                                        </Show>
                                    </div>
                                    <span class="text-xs text-neutral-500">{rec().strategy}</span>
                                </div>

                                <div class="grid grid-cols-3 gap-3 mb-3">
                                    <Metric
                                        label="Coverage"
                                        value={`${rec().confidence}%`}
                                        tone={rec().confidence >= 80 ? 'good' : 'warn'}
                                    />
                                    <Metric
                                        label="Excess"
                                        value={`${rec().excessPermissions.length}`}
                                        tone={rec().excessPermissions.length === 0 ? 'good' : 'warn'}
                                    />
                                    <Metric
                                        label="Missing"
                                        value={`${rec().missingPermissions.length}`}
                                        tone={rec().missingPermissions.length === 0 ? 'good' : 'bad'}
                                    />
                                </div>

                                <PermissionVisualizer
                                    breakdown={rec().roleBreakdown}
                                    missing={rec().missingPermissions}
                                />
                            </div>
                        </Show>
                    )}
                </Index>
            </div>
        </Show>
    );
};
