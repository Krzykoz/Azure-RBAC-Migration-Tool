import { useState, useCallback, useMemo } from 'react';
import {
  KeyVault,
  RoleDefinition,
  RoleAssignment,
  MigrationAnalysis,
  IdentityType,
} from '../../core/types';
import { analyzePolicies, analyzeExistingCoverage } from '../../core/analysis/engine';
import { pickRecommendedIndex } from '../../core/presentation/recommendationPicker';
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
  runAnalysis: () => void;
  clearResults: () => void;
}

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

  const runAnalysis = useCallback(() => {
    if (!selectedVault) throw new Error('Select a Key Vault before running analysis.');

    // ponytail: synchronous bounded search; no delayed result can cross a vault selection.
    const enhancedAnalysis = analyzePolicies(selectedVault.accessPolicies, rolesToAnalyze).map((analysis) => ({
      ...analysis,
      existingCoverage: analyzeExistingCoverage(
        analysis.originalPolicy, roleAssignments, availableRoles, selectedVault.id
      ),
    }));
    const defaults: Record<string, number> = {};
    const exportIds = new Set<string>();
    enhancedAnalysis.forEach((analysis) => {
      const key = getPolicyKey(analysis.originalPolicy);
      defaults[key] = Math.max(0, pickRecommendedIndex(analysis.recommendations));
      if (resolveIdentityType(analysis.originalPolicy, resolvedNames) !== 'Unknown') exportIds.add(key);
    });

    setResults(enhancedAnalysis);
    setSelectedRoles(defaults);
    setSelectedForExport(exportIds);
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
