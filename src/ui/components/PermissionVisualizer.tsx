import React from 'react';
import { RoleBreakdown } from '../../core/types';
import { AlertTriangleIcon } from '../icons';
import { formatPermissionLabel } from '../../core/presentation/permissionFormat';
import {
  PERMISSION_VISIBLE_LIMIT,
  PermissionKind,
  isPrivilegedPermission,
  orderPermissionsForDisplay,
} from '../../core/presentation/permissionDisplay';

const BADGE_CLASS = {
  missing: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-900',
  covered: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-900',
  excess: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-900',
  privileged: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/60 dark:text-amber-200 dark:border-amber-600',
};

/** Hides the native disclosure triangle in every engine. */
export const SUMMARY_RESET = 'cursor-pointer list-none [&::-webkit-details-marker]:hidden';

const Badge: React.FC<{ permission: string; kind: PermissionKind }> = ({ permission, kind }) => {
  const privileged = kind === 'excess' && isPrivilegedPermission(permission);
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] font-semibold border truncate max-w-[200px] ${BADGE_CLASS[privileged ? 'privileged' : kind]}`}
      title={privileged ? 'This is a privileged operation' : permission}
    >
      {kind === 'missing' && <AlertTriangleIcon className="w-3 h-3 mr-1 flex-shrink-0" />}
      {kind === 'excess' && '+ '}
      {formatPermissionLabel(permission)}
      {privileged && <AlertTriangleIcon className="w-3 h-3 ml-1 flex-shrink-0" />}
    </span>
  );
};

const BadgeList: React.FC<{ permissions: string[]; kind: PermissionKind }> = ({ permissions, kind }) => {
  if (permissions.length === 0) return null;
  const ordered = orderPermissionsForDisplay(permissions, kind);
  const overflow = ordered.slice(PERMISSION_VISIBLE_LIMIT);
  return (
    <div className="flex flex-wrap gap-1">
      {ordered.slice(0, PERMISSION_VISIBLE_LIMIT).map((p) => <Badge key={p} permission={p} kind={kind} />)}
      {overflow.length > 0 && (
        <details className="group/more w-full">
          <summary className={`w-fit text-[10px] italic text-neutral-500 hover:underline dark:text-neutral-400 ${SUMMARY_RESET}`}>
            <span className="group-open/more:hidden">+{overflow.length} more...</span>
            <span className="hidden group-open/more:inline">Show less</span>
          </summary>
          <div className="mt-1 flex flex-wrap gap-1">
            {overflow.map((p) => <Badge key={p} permission={p} kind={kind} />)}
          </div>
        </details>
      )}
    </div>
  );
};

interface PermissionVisualizerProps {
  breakdown: RoleBreakdown[];
  missing: string[];
}

export const PermissionVisualizer: React.FC<PermissionVisualizerProps> = ({ breakdown, missing }) => (
  <div className="flex flex-col gap-3 mt-2">
    {missing.length > 0 && (
      <div className="flex flex-col gap-1">
        <div className="text-[10px] font-bold uppercase tracking-wide text-red-700 dark:text-red-400">
          Missing Permissions
        </div>
        <BadgeList permissions={missing} kind="missing" />
      </div>
    )}

    {breakdown.map((role, idx) => (
      <div key={`${idx}-${role.roleName}`} className="flex flex-col gap-1 pl-3 border-l-2 border-neutral-200 dark:border-neutral-700">
        <div className="text-xs font-bold text-neutral-800 dark:text-neutral-200">{role.roleName}</div>
        <BadgeList permissions={role.covered} kind="covered" />
        <BadgeList permissions={role.excess} kind="excess" />
      </div>
    ))}
  </div>
);
