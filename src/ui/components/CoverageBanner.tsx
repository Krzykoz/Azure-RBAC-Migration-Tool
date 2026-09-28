import React from 'react';
import { ExistingCoverageResult } from '../../core/types';
import { CheckCircleIcon, ShieldCheckIcon } from '../icons';
import { PermissionVisualizer, SUMMARY_RESET } from './PermissionVisualizer';

const TONES = {
  full: {
    box: 'bg-green-50 dark:bg-green-900/20 border-green-100 dark:border-green-800',
    title: 'text-green-800 dark:text-green-300',
    detail: 'border-green-200 dark:border-green-800 text-green-700 dark:text-green-400',
  },
  partial: {
    box: 'bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-800',
    title: 'text-blue-800 dark:text-blue-300',
    detail: 'border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400',
  },
};

/** Existing direct-principal RBAC coverage: full, partial (some roles already match), or nothing. */
export const CoverageBanner: React.FC<{ coverage: ExistingCoverageResult }> = ({ coverage }) => {
  const full = coverage.isFullyCovered;
  if (!full && coverage.roleMatches.length === 0) return null;

  const tone = TONES[full ? 'full' : 'partial'];
  const Icon = full ? CheckCircleIcon : ShieldCheckIcon;
  const title = (
    <>
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span className="flex-1">{full ? 'Fully' : 'Partially'} Covered by Direct-Principal RBAC Assignments</span>
    </>
  );
  const heading = `flex items-center gap-1 font-semibold ${tone.title}`;

  if (coverage.roleMatches.length === 0) {
    return <div className={`mb-2 rounded border p-2 text-xs ${tone.box}`}><div className={heading}>{title}</div></div>;
  }

  return (
    <details className={`group/banner mb-2 rounded border p-2 text-xs ${tone.box}`}>
      <summary className={`${heading} ${SUMMARY_RESET}`}>
        {title}
        <span className="text-[10px] font-medium group-open/banner:hidden">Show details</span>
        <span className="hidden text-[10px] font-medium group-open/banner:inline">Hide details</span>
      </summary>
      <div className={`mt-2 border-t pt-2 ${tone.detail}`}>
        <div className="text-[10px] font-medium uppercase tracking-wide mb-1">Direct-Principal Assignments Coverage</div>
        <PermissionVisualizer breakdown={coverage.roleMatches} missing={full ? [] : coverage.missingPermissions} />
      </div>
    </details>
  );
};
