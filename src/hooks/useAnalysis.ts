import { useState, useCallback, useMemo } from 'react';
import {
    KeyVault,
    RoleDefinition,
    RoleAssignment,
    MigrationAnalysis,
    MigrationStatus,
    IdentityType,
} from '../types';
import { analyzePolicies, analyzeExistingCoverage } from '../services/analysisService';
import { STRATEGY_PRIORITY } from '../constants';
import { getExportableIdentities } from '../utils/identityUtils';

interface UseAnalysisProps {
    selectedVault: KeyVault | null;
    availableRoles: RoleDefinition[];
    roleAssignments: RoleAssignment[];
    resolvedNames: Record<string, { name: string; type: IdentityType }>;
    includeCustomRoles: boolean;
}

interface UseAnalysisResult {
    results: MigrationAnalysis[];
    selectedRoles: Record<string, number>;
    setSelectedRoles: React.Dispatch<React.SetStateAction<Record<string, number>>>;
    selectedForExport: Set<string>;
    setSelectedForExport: React.Dispatch<React.SetStateAction<Set<string>>>;
    runAnalysis: () => Promise<void>;
    clearResults: () => void;
}

/**
 * Determines the best strategy index for a given analysis result
 */
const findBestStrategyIndex = (recommendations: MigrationAnalysis['recommendations']): number => {
    if (recommendations.length === 0) return 0;

    let bestIndex = 0;
    let bestConfidence = recommendations[0]?.confidence || 0;

    for (let i = 1; i < recommendations.length; i++) {
        const current = recommendations[i];
        const currentConfidence = current.confidence;

        if (currentConfidence > bestConfidence) {
            bestIndex = i;
            bestConfidence = currentConfidence;
        } else if (currentConfidence === bestConfidence) {
            const currentPriority = STRATEGY_PRIORITY[current.strategy] || 0;
            const bestPriority = STRATEGY_PRIORITY[recommendations[bestIndex].strategy] || 0;

            if (currentPriority > bestPriority) {
                bestIndex = i;
            }
        }
    }

    return bestIndex;
};

/**
 * Hook for managing RBAC analysis state and execution
 */
export const useAnalysis = ({
    selectedVault,
    availableRoles,
    roleAssignments,
    resolvedNames,
    includeCustomRoles,
}: UseAnalysisProps): UseAnalysisResult => {
    const [results, setResults] = useState<MigrationAnalysis[]>([]);
    const [selectedRoles, setSelectedRoles] = useState<Record<string, number>>({});
    const [selectedForExport, setSelectedForExport] = useState<Set<string>>(new Set());

    // Filter roles based on custom role toggle
    const rolesToAnalyze = useMemo(() => {
        if (includeCustomRoles) return availableRoles;
        return availableRoles.filter((r) => r.properties.type === 'BuiltInRole');
    }, [availableRoles, includeCustomRoles]);

    const runAnalysis = useCallback(async () => {
        if (!selectedVault) return;

        // Run analysis (using setTimeout to allow UI to update)
        return new Promise<void>((resolve) => {
            setTimeout(() => {
                const analysis = analyzePolicies(selectedVault.accessPolicies, rolesToAnalyze);

                // Enhance with existing coverage check
                const enhancedAnalysis = analysis.map((a) => {
                    const coverage = analyzeExistingCoverage(
                        a.originalPolicy,
                        roleAssignments,
                        availableRoles,
                        selectedVault.id
                    );
                    return { ...a, existingCoverage: coverage };
                });

                setResults(enhancedAnalysis);

                // Set default strategy selections
                const defaults: Record<string, number> = {};
                enhancedAnalysis.forEach((a) => {
                    defaults[a.originalPolicy.objectId] = findBestStrategyIndex(a.recommendations);
                });
                setSelectedRoles(defaults);

                // Initialize export selection (all except Unknown type)
                const exportIds = getExportableIdentities(enhancedAnalysis, resolvedNames);
                setSelectedForExport(exportIds);

                resolve();
            }, 100);
        });
    }, [selectedVault, rolesToAnalyze, roleAssignments, availableRoles, resolvedNames]);

    const clearResults = useCallback(() => {
        setResults([]);
        setSelectedRoles({});
        setSelectedForExport(new Set());
    }, []);

    return {
        results,
        selectedRoles,
        setSelectedRoles,
        selectedForExport,
        setSelectedForExport,
        runAnalysis,
        clearResults,
    };
};
