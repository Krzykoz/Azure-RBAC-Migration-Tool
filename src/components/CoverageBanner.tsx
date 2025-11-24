import React from 'react';
import { ExistingCoverageResult } from '../types';
import { CheckCircleIcon, ShieldCheckIcon } from './Icons';
import { PermissionVisualizer } from './PermissionVisualizer';

interface CoverageBannerProps {
    existingCoverage: ExistingCoverageResult;
    objectId: string;
    showDetails: boolean;
    onToggleDetails: (id: string) => void;
    showSuggestions?: boolean;
    onToggleSuggestions?: (id: string) => void;
}

export const CoverageBanner: React.FC<CoverageBannerProps> = ({
    existingCoverage,
    objectId,
    showDetails,
    onToggleDetails,
    showSuggestions,
    onToggleSuggestions
}) => {
    const isFullyCovered = existingCoverage.isFullyCovered;

    if (isFullyCovered) {
        return (
            <>
                <div className="p-2 bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800 rounded text-xs mb-2">
                    <div className="font-semibold text-green-800 dark:text-green-300 flex items-center gap-1 mb-2">
                        <CheckCircleIcon className="w-3.5 h-3.5" /> Fully Covered via RBAC
                    </div>
                    {showDetails && (
                        <div className="pt-2 border-t border-green-200 dark:border-green-800">
                            <div className="text-[10px] font-medium text-green-700 dark:text-green-400 uppercase tracking-wide mb-1">Existing Roles Coverage</div>
                            <PermissionVisualizer
                                breakdown={existingCoverage.roleMatches.map(rm => ({
                                    roleName: rm.roleName,
                                    covered: rm.covered,
                                    excess: rm.excess
                                }))}
                                missing={[]}
                            />
                        </div>
                    )}
                    <button
                        onClick={() => onToggleDetails(objectId)}
                        className="mt-2 w-full text-center text-[10px] text-green-700 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300 font-medium border-t border-green-200 dark:border-green-800 pt-1"
                    >
                        {showDetails ? 'Hide Details' : 'Show Details'}
                    </button>
                </div>
                {onToggleSuggestions && (
                    <button
                        onClick={() => onToggleSuggestions(objectId)}
                        className="mb-2 text-[10px] text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 underline"
                    >
                        {showSuggestions ? 'Hide Suggested Roles' : 'Show Suggested Roles'}
                    </button>
                )}
            </>
        );
    }

    // Partially Covered
    if (existingCoverage.roleMatches.length > 0) {
        return (
            <div className="p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded text-xs mb-2">
                <div className="font-semibold text-blue-800 dark:text-blue-300 flex items-center gap-1 mb-2">
                    <ShieldCheckIcon className="w-3.5 h-3.5" /> Partially Covered
                </div>
                {showDetails && (
                    <div className="pt-2 border-t border-blue-200 dark:border-blue-800">
                        <div className="text-[10px] font-medium text-blue-700 dark:text-blue-400 uppercase tracking-wide mb-1">Existing Roles Coverage</div>
                        <PermissionVisualizer
                            breakdown={existingCoverage.roleMatches.map(rm => ({
                                roleName: rm.roleName,
                                covered: rm.covered,
                                excess: rm.excess
                            }))}
                            missing={existingCoverage.missingPermissions}
                        />
                    </div>
                )}
                <button
                    onClick={() => onToggleDetails(objectId)}
                    className="mt-2 w-full text-center text-[10px] text-blue-700 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium border-t border-blue-200 dark:border-blue-800 pt-1"
                >
                    {showDetails ? 'Hide Details' : 'Show Details'}
                </button>
            </div>
        );
    }

    return null;
};
