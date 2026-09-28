import React from 'react';
import { MigrationAnalysis } from '../../core/types';
import { UserIcon, GroupIcon, AppIcon, UnknownIcon, CheckCircleIcon, ShieldCheckIcon, CompoundIdentityIcon } from '../icons';
import { PermissionVisualizer, SUMMARY_RESET } from './PermissionVisualizer';
import { CoverageBanner } from './CoverageBanner';
import { Checkbox } from '../primitives/Checkbox';
import {
  IdentityIconKind,
  ResolvedNames,
  describeIdentity,
  identityIconKind,
  isCompoundIdentity,
  resolveIdentityType,
  shouldShowObjectIdSeparately,
} from '../../core/identity/identity';

export const ICON_BY_KIND: Record<IdentityIconKind, React.ReactNode> = {
  compound: <CompoundIdentityIcon className="w-4 h-4" />,
  user: <UserIcon className="w-4 h-4" />,
  group: <GroupIcon className="w-4 h-4" />,
  app: <AppIcon className="w-4 h-4" />,
  unknown: <UnknownIcon className="w-4 h-4" />,
};

const confidenceClass = (confidence: number): string =>
  confidence > 80
    ? 'text-green-700 bg-green-50 dark:text-green-400 dark:bg-green-900/20'
    : confidence > 50
      ? 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-900/20'
      : 'text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-900/20';

const COLUMN_LABEL = 'mb-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-500 2xl:hidden';
const COLUMN = 'min-w-0 border-t border-neutral-200 pt-4 dark:border-neutral-700 2xl:border-0 2xl:pt-0';

/**
 * One panel per strategy, all rendered so the static HTML report can switch
 * them without React; `data-row`/`data-idx` tie a panel to its tab and chart bars.
 */
const StrategyPanel: React.FC<{ rowId: string; idx: number; selected: boolean; children: React.ReactNode }> = ({
  rowId,
  idx,
  selected,
  children,
}) => (
  <div data-row={rowId} data-idx={idx} hidden={!selected}>
    {children}
  </div>
);

interface IdentityResultCardProps {
  res: MigrationAnalysis;
  resolvedNames: ResolvedNames;
  rowId: string;
  selectedIdx: number;
  onSelectRole?: (recIdx: number) => void;
  /** Export selection; omitted in the static report. */
  selection?: { checked: boolean; onToggle: () => void };
}

export const IdentityResultCard: React.FC<IdentityResultCardProps> = ({
  res,
  resolvedNames,
  rowId,
  selectedIdx,
  onSelectRole,
  selection,
}) => {
  const policy = res.originalPolicy;
  const recs = res.recommendations;
  const coverage = res.existingCoverage;
  // For compound identities (objectId + applicationId), show "SP Name on behalf of (App Name)"
  const { displayName } = describeIdentity(policy, resolvedNames);
  const compound = isCompoundIdentity(policy);
  // Graph resolution when available, else the ARM-derived type
  const currentType = resolveIdentityType(policy, resolvedNames);

  return (
    <div className="group hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
      <div className="grid grid-cols-1 gap-5 px-4 py-4 items-start sm:px-6 2xl:grid-cols-12 2xl:gap-4">
        {/* Identity */}
        <div className="min-w-0 2xl:col-span-3 2xl:pr-2">
          <div className="flex items-start gap-4">
            {selection && (
              <Checkbox
                label={`Select ${displayName || policy.objectId}${compound ? ` (app ${policy.applicationId})` : ''} for export`}
                checked={selection.checked}
                onChange={selection.onToggle}
                className="mt-1"
              />
            )}
            <div className={`mt-0.5 w-6 h-6 rounded flex items-center justify-center shrink-0 ${displayName ? 'bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-300' : 'bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-400'}`}>
              {ICON_BY_KIND[identityIconKind(compound, currentType)]}
            </div>
            <div className="min-w-0 flex-1">
              {displayName ? (
                <div className="font-medium text-sm text-neutral-900 dark:text-white break-words">{displayName}</div>
              ) : (
                <div className="font-mono text-xs text-neutral-600 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded border border-neutral-200 dark:border-neutral-700 break-all">
                  {policy.objectId}
                </div>
              )}
              {shouldShowObjectIdSeparately(displayName, policy.objectId) && (
                <div className="text-[10px] text-neutral-500 font-mono mt-0.5 truncate">{policy.objectId}</div>
              )}

              <div className="text-[10px] text-neutral-600 dark:text-neutral-400 mt-1 flex flex-col gap-0.5">
                {compound && <span className="break-all" title="Application ID">App ID: {policy.applicationId}</span>}
                {currentType !== 'Unknown' && <span className="opacity-75">{currentType}</span>}
              </div>

              {compound && (
                <p className="mt-2 text-xs text-amber-800 dark:text-amber-300">
                  Manual migration required: RBAC cannot preserve this application's restriction.
                  PowerShell export will skip this identity.
                </p>
              )}
              {coverage?.isFullyCovered ? (
                <div className="mt-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-[10px] font-medium border border-green-200 dark:border-green-800">
                  <CheckCircleIcon className="w-3 h-3" />
                  Already Covered (Direct Principal)
                </div>
              ) : coverage && coverage.coveredPermissions.length > 0 && (
                <div className="mt-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 text-[10px] font-medium border border-blue-100 dark:border-blue-800">
                  <ShieldCheckIcon className="w-3 h-3" />
                  Partially Covered (Direct Principal)
                </div>
              )}

              {!displayName && !policy.applicationId && (
                <div className="text-[10px] text-amber-600 dark:text-amber-500 mt-1">Resolution Failed</div>
              )}

              <details className="group/policy mt-2">
                <summary className={`w-fit text-[10px] font-medium text-brand-600 dark:text-brand-400 hover:underline ${SUMMARY_RESET}`}>
                  <span className="group-open/policy:hidden">View Legacy Policy</span>
                  <span className="hidden group-open/policy:inline">Hide Legacy Policy</span>
                </summary>
                <div className="mt-2 p-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded text-[10px]">
                  {Object.entries(policy.permissions).map(([category, perms]) => perms && perms.length > 0 && (
                    <div key={category} className="mb-1 last:mb-0">
                      <span className="font-semibold text-neutral-700 dark:text-neutral-300 capitalize">{category}:</span>
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {perms.map((p) => (
                          <span key={p} className="px-1 py-0.5 bg-white dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 rounded text-neutral-600 dark:text-neutral-300">
                            {p}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          </div>
        </div>

        {/* Recommendations */}
        <div className={`${COLUMN} 2xl:col-span-4`}>
          <div className={COLUMN_LABEL}>Recommended Role Combination</div>
          {recs.length === 0 ? (
            <span className="text-xs text-neutral-500">No recommendation available.</span>
          ) : (
            <>
              <div className="flex flex-wrap gap-2 mb-3">
                {recs.map((rec, recIdx) => (
                  <button
                    key={recIdx}
                    type="button"
                    data-tab-row={rowId}
                    data-idx={recIdx}
                    aria-pressed={recIdx === selectedIdx}
                    onClick={() => onSelectRole?.(recIdx)}
                    title={rec.reasoning}
                    className="px-2 py-1 rounded-sm text-[10px] font-bold uppercase tracking-wide border transition-all bg-white border-neutral-200 text-neutral-500 hover:border-brand-300 hover:text-neutral-700 dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 aria-pressed:bg-brand-50 aria-pressed:border-brand-200 aria-pressed:text-brand-700 dark:aria-pressed:bg-brand-900/20 dark:aria-pressed:border-brand-900 dark:aria-pressed:text-brand-300"
                  >
                    {rec.strategy}
                  </button>
                ))}
              </div>
              {recs.map((rec, recIdx) => (
                <StrategyPanel key={recIdx} rowId={rowId} idx={recIdx} selected={recIdx === selectedIdx}>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {rec.roleNames.length > 0 ? (
                      rec.roleNames.map((roleName) => (
                        <span key={roleName} className="inline-flex max-w-full items-center break-words px-2 py-1 rounded bg-neutral-100 dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 text-xs font-medium text-neutral-800 dark:text-neutral-200">
                          {roleName}
                        </span>
                      ))
                    ) : (
                      <span className="font-semibold text-sm text-neutral-800 dark:text-neutral-200">{rec.roleName}</span>
                    )}
                  </div>
                  <div className="text-xs text-neutral-700 dark:text-neutral-400 line-clamp-3 group-hover:line-clamp-none transition-all">
                    {rec.reasoning}
                  </div>
                </StrategyPanel>
              ))}
            </>
          )}
        </div>

        {/* Coverage */}
        <div className={`${COLUMN} 2xl:col-span-2 2xl:text-right`}>
          <div className={COLUMN_LABEL}>Coverage</div>
          {recs.map((rec, recIdx) => (
            <StrategyPanel key={recIdx} rowId={rowId} idx={recIdx} selected={recIdx === selectedIdx}>
              <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${confidenceClass(rec.confidence)}`}>
                {rec.confidence}%
              </span>
            </StrategyPanel>
          ))}
        </div>

        {/* Gap Analysis */}
        <div className={`${COLUMN} 2xl:col-span-3`}>
          <div className={COLUMN_LABEL}>Gap Analysis</div>
          <div className="flex flex-col gap-1">
            {coverage && <CoverageBanner coverage={coverage} />}
            {recs.map((rec, recIdx) => (
              <StrategyPanel key={recIdx} rowId={rowId} idx={recIdx} selected={recIdx === selectedIdx}>
                {rec.missingPermissions.length === 0 && !coverage?.isFullyCovered && (
                  <div className="flex items-center gap-1.5 text-green-700 dark:text-green-400 text-xs font-semibold mb-1">
                    <CheckCircleIcon className="w-3.5 h-3.5" />
                    <span>Complete Coverage</span>
                  </div>
                )}
                <PermissionVisualizer breakdown={rec.roleBreakdown} missing={rec.missingPermissions} />
              </StrategyPanel>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
