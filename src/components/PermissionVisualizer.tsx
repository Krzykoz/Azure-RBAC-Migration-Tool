import { createSignal, For, Show, type JSX } from 'solid-js';
import { RoleBreakdown } from '../types';
import { AlertTriangleIcon } from './Icons';
import { formatPermissionLabel } from '../utils/permissionFormat';
import {
    PERMISSION_VISIBLE_LIMIT,
    PermissionBadgeVariant,
    PermissionKind,
    orderPermissionsForDisplay,
    permissionBadgeDescriptor,
    roleBreakdownCanExpand,
} from '../utils/permissionDisplay';

const BADGE_CLASS: Record<PermissionBadgeVariant, string> = {
    missing: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-900',
    covered: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-900',
    excess: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-900',
    'excess-priv': 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/60 dark:text-amber-200 dark:border-amber-600',
};

const BadgeList = (props: {
    perms: string[];
    kind: PermissionKind;
    isExpanded: boolean;
}): JSX.Element => {
    const displayPerms = () => orderPermissionsForDisplay(props.perms, props.kind);
    const itemsToShow = () =>
        props.isExpanded ? displayPerms() : displayPerms().slice(0, PERMISSION_VISIBLE_LIMIT);
    const hasMore = () => displayPerms().length > PERMISSION_VISIBLE_LIMIT;

    return (
        <Show when={props.perms.length > 0}>
            <For each={itemsToShow()}>
                {(p) => {
                    const desc = permissionBadgeDescriptor(p, props.kind);
                    const tooltipText = desc.privileged ? 'This is a privileged operation' : p;
                    return (
                        <span
                            class={`inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] font-semibold border truncate max-w-[200px] ${BADGE_CLASS[desc.variant]}`}
                            title={tooltipText}
                        >
                            <Show when={desc.leadingAlert}>
                                <AlertTriangleIcon class="w-3 h-3 mr-1 flex-shrink-0" />
                            </Show>
                            {desc.plusPrefix && '+ '}
                            {formatPermissionLabel(p)}
                            <Show when={desc.trailingAlert}>
                                <AlertTriangleIcon class="w-3 h-3 ml-1 flex-shrink-0" />
                            </Show>
                        </span>
                    );
                }}
            </For>
            <Show when={hasMore() && !props.isExpanded}>
                <span class="text-[10px] text-neutral-500 dark:text-neutral-400 italic pl-1">
                    +{props.perms.length - PERMISSION_VISIBLE_LIMIT} more...
                </span>
            </Show>
        </Show>
    );
};

interface PermissionVisualizerProps {
    breakdown: RoleBreakdown[];
    missing: string[];
}

export const PermissionVisualizer = (props: PermissionVisualizerProps): JSX.Element => {
    const [expandedRoles, setExpandedRoles] = createSignal<Record<number, boolean>>({});
    const [missingExpanded, setMissingExpanded] = createSignal(false);

    const toggleExpand = (roleIdx: number) => {
        setExpandedRoles((prev) => ({ ...prev, [roleIdx]: !prev[roleIdx] }));
    };

    return (
        <div class="flex flex-col gap-3 mt-2">
            {/* Missing Permissions Section */}
            <Show when={props.missing.length > 0}>
                <div class="flex flex-col gap-1">
                    <div class="flex items-baseline justify-between">
                        <div class="text-[10px] font-bold uppercase tracking-wide text-red-700 dark:text-red-400">
                            Missing Permissions
                        </div>
                        <Show when={props.missing.length > PERMISSION_VISIBLE_LIMIT}>
                            <button
                                onClick={(e) => {
                                    e.preventDefault();
                                    setMissingExpanded(!missingExpanded());
                                }}
                                class="text-[10px] text-brand-600 dark:text-brand-400 hover:underline"
                            >
                                {missingExpanded() ? 'Show Less' : 'Show All'}
                            </button>
                        </Show>
                    </div>
                    <div class="flex flex-wrap gap-1">
                        <BadgeList perms={props.missing} kind="missing" isExpanded={missingExpanded()} />
                    </div>
                </div>
            </Show>

            {/* Grouped Roles Section */}
            <For each={props.breakdown}>
                {(role, idx) => (
                    <div class="relative flex flex-col gap-1 pl-3 border-l-2 border-neutral-200 dark:border-neutral-700">
                        <div class="flex items-baseline justify-between">
                            <div class="text-xs font-bold text-neutral-800 dark:text-neutral-200">
                                {role.roleName}
                            </div>
                            {/* Show the toggle when either covered or excess overflows independently */}
                            <Show when={roleBreakdownCanExpand(role)}>
                                <button
                                    onClick={(e) => {
                                        e.preventDefault();
                                        toggleExpand(idx());
                                    }}
                                    class="text-[10px] text-brand-600 dark:text-brand-400 hover:underline"
                                >
                                    {expandedRoles()[idx()] ? 'Show Less' : 'Show All'}
                                </button>
                            </Show>
                        </div>

                        {/* Covered */}
                        <Show when={role.covered.length > 0}>
                            <div class="flex flex-wrap gap-1">
                                <BadgeList
                                    perms={role.covered}
                                    kind="covered"
                                    isExpanded={!!expandedRoles()[idx()]}
                                />
                            </div>
                        </Show>

                        {/* Excess */}
                        <Show when={role.excess.length > 0}>
                            <div class="flex flex-wrap gap-1">
                                <BadgeList
                                    perms={role.excess}
                                    kind="excess"
                                    isExpanded={!!expandedRoles()[idx()]}
                                />
                            </div>
                        </Show>
                    </div>
                )}
            </For>
        </div>
    );
};
