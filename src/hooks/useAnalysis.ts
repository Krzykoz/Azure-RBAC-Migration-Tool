import { createSignal, createMemo, type Accessor, type Setter } from 'solid-js';
import {
    KeyVault,
    RoleDefinition,
    RoleAssignment,
    MigrationAnalysis,
    IdentityType,
} from '../types';
import { analyzePolicies, analyzeExistingCoverage } from '../services/analysisService';
import { STRATEGY_PRIORITY } from '../constants';
import { getPolicyKey } from '../utils/policyKey';
import { resolveIdentityType } from '../utils/identity';

interface UseAnalysisProps {
    selectedVault: Accessor<KeyVault | null>;
    availableRoles: Accessor<RoleDefinition[]>;
    roleAssignments: Accessor<RoleAssignment[]>;
    resolvedNames: Accessor<Record<string, { name: string; type: IdentityType }>>;
    includeCustomRoles: Accessor<boolean>;
}

export interface UseAnalysis {
    results: Accessor<MigrationAnalysis[]>;
    selectedRoles: Accessor<Record<string, number>>;
    setSelectedRoles: Setter<Record<string, number>>;
    selectedForExport: Accessor<Set<string>>;
    setSelectedForExport: Setter<Set<string>>;
    runAnalysis: () => Promise<void>;
    clearResults: () => void;
}

/**
 * Pick the highest-confidence recommendation, breaking ties by strategy priority
 * (Minimize Excess > Balanced > Max Coverage).
 */
const findBestStrategyIndex = (
    recommendations: MigrationAnalysis['recommendations']
): number => {
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
 * Runs the RBAC analysis for the selected vault and holds the per-identity
 * strategy selection plus the export selection.
 */
export const useAnalysis = (props: UseAnalysisProps): UseAnalysis => {
    const [results, setResults] = createSignal<MigrationAnalysis[]>([]);
    const [selectedRoles, setSelectedRoles] = createSignal<Record<string, number>>({});
    const [selectedForExport, setSelectedForExport] = createSignal<Set<string>>(new Set());

    // Filter roles based on the custom-role toggle.
    const rolesToAnalyze = createMemo(() => {
        const roles = props.availableRoles();
        if (props.includeCustomRoles()) return roles;
        return roles.filter((r) => r.properties.type === 'BuiltInRole');
    });

    const runAnalysis = (): Promise<void> => {
        const vault = props.selectedVault();
        if (!vault) return Promise.resolve();

        // Snapshot every input at invocation time so the deferred run analyzes a
        // coherent set, matching the React closure that captured these values when
        // runAnalysis was called (not 100ms later).
        const roles = rolesToAnalyze();
        const roleAssignments = props.roleAssignments();
        const availableRoles = props.availableRoles();
        const resolvedNames = props.resolvedNames();

        // Defer so the "Processing..." UI can paint before the synchronous work.
        return new Promise<void>((resolve) => {
            setTimeout(() => {
                const analysis = analyzePolicies(vault.accessPolicies, roles);

                // Enhance with existing coverage check
                const enhancedAnalysis = analysis.map((a) => {
                    const coverage = analyzeExistingCoverage(
                        a.originalPolicy,
                        roleAssignments,
                        availableRoles,
                        vault.id
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
    };

    const clearResults = () => {
        setResults([]);
        setSelectedRoles({});
        setSelectedForExport(new Set<string>());
    };

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
