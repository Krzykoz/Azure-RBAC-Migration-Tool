import React, { useState } from 'react';
import { RoleBreakdown } from '../types';
import { AlertTriangleIcon } from './Icons';

interface PermissionVisualizerProps {
    breakdown: RoleBreakdown[];
    missing: string[];
}

export const PermissionVisualizer: React.FC<PermissionVisualizerProps> = ({ breakdown, missing }) => {
    const [expandedRoles, setExpandedRoles] = useState<Record<string, boolean>>({});
    const [missingExpanded, setMissingExpanded] = useState(false);
    const VISIBLE_LIMIT = 6;

    const toggleExpand = (roleIdx: number) => {
        setExpandedRoles(prev => ({ ...prev, [roleIdx]: !prev[roleIdx] }));
    };

    // Format raw Azure RBAC strings into readable labels
    const formatPerm = (p: string) => {
        if (!p) return '';

        // Handle pure wildcard scenarios often seen in excess permissions
        if (p === '*' || p.endsWith('/*') || p === 'Microsoft.KeyVault/vaults/*') {
            return 'Full Access (*)';
        }

        // Remove the common prefix
        let label = p.replace(/Microsoft\.KeyVault\/vaults\//i, '');

        // Remove action suffix (e.g. /action, /read, /write) to keep it clean
        label = label.replace(/\/action$/i, '');
        label = label.replace(/\/read$/i, ' (read)');

        // Fallback if the replace didn't change much (e.g. custom provider actions), try to simplify
        if (label.length > 40) {
            const parts = label.split('/');
            return parts.length > 1 ? parts.slice(-2).join('/') : label;
        }

        return label;
    };

    const renderBadgeList = (perms: string[], type: 'missing' | 'covered' | 'excess', keyPrefix: string, isExpanded: boolean) => {
        if (perms.length === 0) return null;

        const itemsToShow = isExpanded ? perms : perms.slice(0, VISIBLE_LIMIT);
        const hasMore = perms.length > VISIBLE_LIMIT;

        return (
            <>
                {itemsToShow.map((p, i) => {
                    let colorClass = '';
                    if (type === 'missing') colorClass = 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-900';
                    if (type === 'covered') colorClass = 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-900';
                    if (type === 'excess') colorClass = 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-900';

                    return (
                        <span key={`${keyPrefix}-${i}`} className={`inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] font-semibold border truncate max-w-[200px] ${colorClass}`} title={p}>
                            {type === 'missing' && <AlertTriangleIcon className="w-3 h-3 mr-1 flex-shrink-0" />}
                            {type === 'excess' && '+ '}
                            {formatPerm(p)}
                        </span>
                    );
                })}
                {hasMore && !isExpanded && (
                    <span className="text-[10px] text-neutral-500 dark:text-neutral-400 italic pl-1">
                        +{perms.length - VISIBLE_LIMIT} more...
                    </span>
                )}
            </>
        );
    };

    return (
        <div className="flex flex-col gap-3 mt-2">
            {/* Missing Permissions Section */}
            {missing.length > 0 && (
                <div className="flex flex-col gap-1">
                    <div className="flex items-baseline justify-between">
                        <div className="text-[10px] font-bold uppercase tracking-wide text-red-700 dark:text-red-400">
                            Missing Permissions
                        </div>
                        {missing.length > VISIBLE_LIMIT && (
                            <button
                                onClick={(e) => { e.preventDefault(); setMissingExpanded(!missingExpanded); }}
                                className="text-[10px] text-brand-600 dark:text-brand-400 hover:underline"
                            >
                                {missingExpanded ? 'Show Less' : 'Show All'}
                            </button>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-1">
                        {renderBadgeList(missing, 'missing', 'missing', missingExpanded)}
                    </div>
                </div>
            )}

            {/* Grouped Roles Section */}
            {breakdown.map((role, idx) => (
                <div key={idx} className="relative flex flex-col gap-1 pl-3 border-l-2 border-neutral-200 dark:border-neutral-700">
                    <div className="flex items-baseline justify-between">
                        <div className="text-xs font-bold text-neutral-800 dark:text-neutral-200">
                            {role.roleName}
                        </div>
                        {/* Logic Fix: Check if either list is truncated independently */}
                        {(role.covered.length > VISIBLE_LIMIT || role.excess.length > VISIBLE_LIMIT) && (
                            <button
                                onClick={(e) => { e.preventDefault(); toggleExpand(idx); }}
                                className="text-[10px] text-brand-600 dark:text-brand-400 hover:underline"
                            >
                                {expandedRoles[idx] ? 'Show Less' : 'Show All'}
                            </button>
                        )}
                    </div>

                    {/* Covered */}
                    {role.covered.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                            {renderBadgeList(role.covered, 'covered', `role-${idx}-cov`, expandedRoles[idx])}
                        </div>
                    )}

                    {/* Excess */}
                    {role.excess.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                            {renderBadgeList(role.excess, 'excess', `role-${idx}-exc`, expandedRoles[idx])}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};
