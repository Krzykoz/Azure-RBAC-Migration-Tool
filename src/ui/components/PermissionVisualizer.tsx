import React, { useState } from 'react';
import { RoleBreakdown } from '../../core/types';
import { AlertTriangleIcon } from '../icons';
import { formatPermissionLabel } from '../../core/presentation/permissionFormat';
import {
  PERMISSION_VISIBLE_LIMIT,
  PermissionBadgeVariant,
  orderPermissionsForDisplay,
  permissionBadgeDescriptor,
  roleBreakdownCanExpand,
} from '../../core/presentation/permissionDisplay';

const BADGE_CLASS: Record<PermissionBadgeVariant, string> = {
  missing: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-900',
  covered: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-900',
  excess: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-900',
  'excess-priv': 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/60 dark:text-amber-200 dark:border-amber-600',
};

interface PermissionVisualizerProps {
  breakdown: RoleBreakdown[];
  missing: string[];
}

export const PermissionVisualizer: React.FC<PermissionVisualizerProps> = ({ breakdown, missing }) => {
  const [expandedRoles, setExpandedRoles] = useState<Record<string, boolean>>({});
  const [missingExpanded, setMissingExpanded] = useState(false);

  const toggleExpand = (roleIdx: number) => {
    setExpandedRoles((prev) => ({ ...prev, [roleIdx]: !prev[roleIdx] }));
  };

  const renderBadgeList = (perms: string[], type: 'missing' | 'covered' | 'excess', keyPrefix: string, isExpanded: boolean) => {
    if (perms.length === 0) return null;

    const displayPerms = orderPermissionsForDisplay(perms, type);
    const itemsToShow = isExpanded ? displayPerms : displayPerms.slice(0, PERMISSION_VISIBLE_LIMIT);
    const hasMore = displayPerms.length > PERMISSION_VISIBLE_LIMIT;

    return (
      <>
        {itemsToShow.map((p, i) => {
          const desc = permissionBadgeDescriptor(p, type);
          const tooltipText = desc.privileged ? 'This is a privileged operation' : p;

          return (
            <span key={`${keyPrefix}-${i}`} className={`inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] font-semibold border truncate max-w-[200px] ${BADGE_CLASS[desc.variant]}`} title={tooltipText}>
              {desc.leadingAlert && <AlertTriangleIcon className="w-3 h-3 mr-1 flex-shrink-0" />}
              {desc.plusPrefix && '+ '}
              {formatPermissionLabel(p)}
              {desc.trailingAlert && <AlertTriangleIcon className="w-3 h-3 ml-1 flex-shrink-0" />}
            </span>
          );
        })}
        {hasMore && !isExpanded && (
          <span className="text-[10px] text-neutral-500 dark:text-neutral-400 italic pl-1">
            +{perms.length - PERMISSION_VISIBLE_LIMIT} more...
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
            {missing.length > PERMISSION_VISIBLE_LIMIT && (
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
            {/* Show the toggle when either covered or excess overflows independently */}
            {roleBreakdownCanExpand(role) && (
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
