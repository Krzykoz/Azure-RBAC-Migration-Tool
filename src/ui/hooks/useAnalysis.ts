import { useState, useCallback, useMemo } from 'react';
import {
  KeyVault,
  RoleDefinition,
  RoleAssignment,
  MigrationAnalysis,
  IdentityType,
} from '../../core/types';
import { analyzePolicies, analyzeExistingCoverage } from '../../core/analysis/engine';
import { STRATEGY_PRIORITY } from '../../core/constants';
import { getPolicyKey } from '../../core/identity/policyKey';
import { resolveIdentityType } from '../../core/identity/identity';

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
 * The default strategy tab for a result: highest confidence, ties broken by
 * {@link STRATEGY_PRIORITY} (stricter strategies win).
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

/** Owns analysis execution and the per-row strategy/export selection state. */
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
          defaults[getPolicyKey(a.originalPolicy)] = findBestStrategyIndex(a.recommendations);
        });
        setSelectedRoles(defaults);

        // Initialize export selection (all except Unknown type)
        const exportIds = new Set<string>();
        enhancedAnalysis.forEach((a) => {
          const type = resolveIdentityType(a.originalPolicy, resolvedNames);
          if (type !== 'Unknown') {
            exportIds.add(getPolicyKey(a.originalPolicy));
          }
        });
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
