import React from 'react';
import { MigrationAnalysis, IdentityType } from '../../core/types';
import { UserIcon, GroupIcon, AppIcon, UnknownIcon, CheckCircleIcon, ShieldCheckIcon, CompoundIdentityIcon } from '../icons';
import { PermissionVisualizer } from './PermissionVisualizer';
import { CoverageBanner } from './CoverageBanner';
import { Checkbox } from '../primitives/Checkbox';
import { getPolicyKey } from '../../core/identity/policyKey';
import {
  IdentityIconKind,
  describeIdentity,
  identityIconKind,
  isCompoundIdentity,
  resolveIdentityType,
  shouldShowObjectIdSeparately,
} from '../../core/identity/identity';
import {
  ConfidenceLevel,
  confidenceLevel,
  existingCoverageBadge,
  showsCompleteCoverage,
} from '../../core/presentation/resultPresentation';

const ICON_BY_KIND: Record<IdentityIconKind, React.ReactNode> = {
  compound: <CompoundIdentityIcon className="w-4 h-4" />,
  user: <UserIcon className="w-4 h-4" />,
  group: <GroupIcon className="w-4 h-4" />,
  app: <AppIcon className="w-4 h-4" />,
  unknown: <UnknownIcon className="w-4 h-4" />,
};

const CONFIDENCE_CLASS: Record<ConfidenceLevel, string> = {
  high: 'text-green-700 bg-green-50 dark:text-green-400 dark:bg-green-900/20',
  mid: 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-900/20',
  low: 'text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-900/20',
};

interface IdentityResultCardProps {
  res: MigrationAnalysis;
  resolvedNames: Record<string, { name: string; type: IdentityType }>;
  selectedRoleIdx: number;
  onSelectRole: (recIdx: number) => void;
  isSelected: boolean;
  onToggleSelection: () => void;
  showSuggestions: boolean;
  onToggleSuggestions: () => void;
  showCoverageDetails: boolean;
  onToggleCoverageDetails: () => void;
  showPolicyDetails: boolean;
  onTogglePolicyDetails: () => void;
}

export const IdentityResultCard: React.FC<IdentityResultCardProps> = ({
  res,
  resolvedNames,
  selectedRoleIdx,
  onSelectRole,
  isSelected,
  onToggleSelection,
  showSuggestions,
  onToggleSuggestions,
  showCoverageDetails,
  onToggleCoverageDetails,
  showPolicyDetails,
  onTogglePolicyDetails,
}) => {
  const policyKey = getPolicyKey(res.originalPolicy);
  const activeRec = res.recommendations[selectedRoleIdx];

  // For compound identities (objectId + applicationId), show "SP Name on behalf of (App Name)"
  const { displayName } = describeIdentity(res.originalPolicy, resolvedNames);
  const hasAppId = isCompoundIdentity(res.originalPolicy);
  // Use the type from graph resolution if available, else fallback to ARM info
  const currentType = resolveIdentityType(res.originalPolicy, resolvedNames);
  const isKnown = !!displayName;
  const isFullyCovered = res.existingCoverage?.isFullyCovered;
  const showRecs = !isFullyCovered || showSuggestions;
  const showDetails = showCoverageDetails;

  return (
    <div className="group hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors">
      <div className="grid grid-cols-12 gap-4 px-6 py-4 items-start">
        {/* Identity Column */}
        <div className="col-span-3 pr-2">
          <div className="flex items-start gap-4">
            <Checkbox
              checked={isSelected}
              onChange={onToggleSelection}
              className="mt-1"
            />
            <div className={`mt-0.5 w-6 h-6 rounded flex items-center justify-center shrink-0 ${isKnown ? 'bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-300' : 'bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-400'
              }`}>
              {ICON_BY_KIND[identityIconKind(hasAppId, currentType)]}
            </div>
            <div className="min-w-0 flex-1">
              {isKnown ? (
                <div className="font-medium text-sm text-neutral-900 dark:text-white break-words">
                  {displayName}
                </div>
              ) : (
                <div className="font-mono text-xs text-neutral-600 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded border border-neutral-200 dark:border-neutral-700 break-all">
                  {res.originalPolicy.objectId}
                </div>
              )}

              {/* Show Object ID in smaller font if we have a name */}
              {shouldShowObjectIdSeparately(displayName, res.originalPolicy.objectId) && (
                <div className="text-[10px] text-neutral-500 dark:text-neutral-500 font-mono mt-0.5 truncate">{res.originalPolicy.objectId}</div>
              )}

              {/* Details about Type and AppID if available */}
              <div className="text-[10px] text-neutral-600 dark:text-neutral-400 mt-1 flex flex-col gap-0.5">
                {hasAppId && (
                  <span title="Application ID">App ID: {res.originalPolicy.applicationId}</span>
                )}
                {currentType !== 'Unknown' && (
                  <span className="opacity-75">{currentType}</span>
                )}
              </div>

              {/* Existing Coverage Badge */}
              {existingCoverageBadge(res.existingCoverage) === 'covered' && (
                <div className="mt-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-[10px] font-medium border border-green-200 dark:border-green-800">
                  <CheckCircleIcon className="w-3 h-3" />
                  Already Covered
                </div>
              )}
              {existingCoverageBadge(res.existingCoverage) === 'partial' && (
                <div className="mt-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 text-[10px] font-medium border border-blue-100 dark:border-blue-800">
                  <ShieldCheckIcon className="w-3 h-3" />
                  Partially Covered
                </div>
              )}

              {/* Fallback message if resolution fails completely and no other info */}
              {!isKnown && !res.originalPolicy.applicationId && (
                <div className="text-[10px] text-amber-600 dark:text-amber-500 mt-1">Resolution Failed</div>
              )}

              {/* Original Policy View Toggle */}
              <button
                onClick={onTogglePolicyDetails}
                className="mt-2 block text-[10px] font-medium text-brand-600 dark:text-brand-400 hover:underline focus:outline-none"
              >
                {showPolicyDetails ? 'Hide Legacy Policy' : 'View Legacy Policy'}
              </button>

              {/* Original Policy Details */}
              {showPolicyDetails && (
                <div className="mt-2 p-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded text-[10px]">
                  {Object.entries(res.originalPolicy.permissions).map(([category, perms]) => {
                    if (!perms || perms.length === 0) return null;

                    return (
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
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Recommendations Column */}
        <div className="col-span-4">
          {/* Selection Tabs for Strategies */}
          {res.recommendations.length > 0 && (
            <div className={`flex flex-wrap gap-2 mb-3 ${!showRecs ? 'opacity-50 grayscale' : ''}`}>
              {res.recommendations.map((rec, recIdx) => (
                <button
                  key={recIdx}
                  onClick={() => onSelectRole(recIdx)}
                  disabled={!showRecs}
                  className={`px-2 py-1 rounded-sm text-[10px] font-bold uppercase tracking-wide border transition-all ${selectedRoleIdx === recIdx
                    ? 'bg-brand-50 border-brand-200 text-brand-700 dark:bg-brand-900/20 dark:border-brand-800 dark:text-brand-300'
                    : 'bg-white border-neutral-200 text-neutral-500 hover:border-brand-300 hover:text-neutral-700 dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'
                    }`}
                  title={rec.reasoning}
                >
                  {rec.strategy}
                </button>
              ))}
            </div>
          )}

          {/* Active Role Display */}
          <div className={`flex flex-wrap gap-1.5 mb-2 ${!showRecs ? 'opacity-50' : ''}`}>
            {activeRec.roleNames && activeRec.roleNames.length > 0 ? (
              activeRec.roleNames.map((roleName, rIdx) => (
                <span key={rIdx} className="inline-flex items-center px-2 py-1 rounded bg-neutral-100 dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 text-xs font-medium text-neutral-800 dark:text-neutral-200">
                  {roleName}
                </span>
              ))
            ) : (
              <span className="font-semibold text-sm text-neutral-800 dark:text-neutral-200">{activeRec.roleName}</span>
            )}
          </div>

          <div className={`text-xs text-neutral-700 dark:text-neutral-400 line-clamp-3 group-hover:line-clamp-none transition-all ${!showRecs ? 'opacity-50' : ''}`}>
            {activeRec.reasoning}
          </div>
        </div>

        {/* Confidence */}
        <div className="col-span-2 text-right">
          <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${CONFIDENCE_CLASS[confidenceLevel(activeRec.confidence)]}`}>
            {activeRec.confidence}%
          </span>
        </div>

        {/* Gaps Analysis */}
        <div className="col-span-3">
          <div className="flex flex-col gap-1">
            {res.existingCoverage && (
              <CoverageBanner
                existingCoverage={res.existingCoverage}
                objectId={policyKey}
                showDetails={showDetails}
                onToggleDetails={() => onToggleCoverageDetails()}
                showSuggestions={showSuggestions}
                onToggleSuggestions={() => onToggleSuggestions()}
              />
            )}

            {showsCompleteCoverage(activeRec.missingPermissions.length, res.existingCoverage) && (
              <div className="flex items-center gap-1.5 text-green-700 dark:text-green-400 text-xs font-semibold mb-1">
                <CheckCircleIcon className="w-3.5 h-3.5" />
                <span>Complete Coverage</span>
              </div>
            )}

            {showRecs && (
              <PermissionVisualizer
                breakdown={activeRec.roleBreakdown || []}
                missing={activeRec.missingPermissions}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
