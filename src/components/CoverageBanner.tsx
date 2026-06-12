import { Switch, Match, Show, type JSX } from 'solid-js';
import { ExistingCoverageResult } from '../types';
import { CheckCircleIcon, ShieldCheckIcon } from './Icons';
import { PermissionVisualizer } from './PermissionVisualizer';
import { coverageBannerKind, roleMatchesToBreakdown } from '../utils/resultPresentation';

interface CoverageBannerProps {
    existingCoverage: ExistingCoverageResult;
    objectId: string;
    showDetails: boolean;
    onToggleDetails: (id: string) => void;
    showSuggestions?: boolean;
    onToggleSuggestions?: (id: string) => void;
}

export const CoverageBanner = (props: CoverageBannerProps): JSX.Element => {
    const kind = () => coverageBannerKind(props.existingCoverage);
    const breakdown = () => roleMatchesToBreakdown(props.existingCoverage);

    return (
        <Switch>
            <Match when={kind() === 'full'}>
                <>
                    <div class="p-2 bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800 rounded text-xs mb-2">
                        <div class="font-semibold text-green-800 dark:text-green-300 flex items-center gap-1 mb-2">
                            <CheckCircleIcon class="w-3.5 h-3.5" /> Fully Covered via RBAC
                        </div>
                        <Show when={props.showDetails}>
                            <div class="pt-2 border-t border-green-200 dark:border-green-800">
                                <div class="text-[10px] font-medium text-green-700 dark:text-green-400 uppercase tracking-wide mb-1">
                                    Existing Roles Coverage
                                </div>
                                <PermissionVisualizer breakdown={breakdown()} missing={[]} />
                            </div>
                        </Show>
                        <button
                            onClick={() => props.onToggleDetails(props.objectId)}
                            class="mt-2 w-full text-center text-[10px] text-green-700 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300 font-medium border-t border-green-200 dark:border-green-800 pt-1"
                        >
                            {props.showDetails ? 'Hide Details' : 'Show Details'}
                        </button>
                    </div>
                    <Show when={props.onToggleSuggestions}>
                        <button
                            onClick={() => props.onToggleSuggestions?.(props.objectId)}
                            class="mb-2 text-[10px] text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 underline"
                        >
                            {props.showSuggestions ? 'Hide Suggested Roles' : 'Show Suggested Roles'}
                        </button>
                    </Show>
                </>
            </Match>

            <Match when={kind() === 'partial'}>
                <div class="p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded text-xs mb-2">
                    <div class="font-semibold text-blue-800 dark:text-blue-300 flex items-center gap-1 mb-2">
                        <ShieldCheckIcon class="w-3.5 h-3.5" /> Partially Covered
                    </div>
                    <Show when={props.showDetails}>
                        <div class="pt-2 border-t border-blue-200 dark:border-blue-800">
                            <div class="text-[10px] font-medium text-blue-700 dark:text-blue-400 uppercase tracking-wide mb-1">
                                Existing Roles Coverage
                            </div>
                            <PermissionVisualizer
                                breakdown={breakdown()}
                                missing={props.existingCoverage.missingPermissions}
                            />
                        </div>
                    </Show>
                    <button
                        onClick={() => props.onToggleDetails(props.objectId)}
                        class="mt-2 w-full text-center text-[10px] text-blue-700 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium border-t border-blue-200 dark:border-blue-800 pt-1"
                    >
                        {props.showDetails ? 'Hide Details' : 'Show Details'}
                    </button>
                </div>
            </Match>
        </Switch>
    );
};
