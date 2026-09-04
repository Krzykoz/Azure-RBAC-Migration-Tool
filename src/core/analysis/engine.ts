import {
  AccessPolicyEntry,
  MigrationAnalysis,
  RoleDefinition,
  SuggestedRole,
  RoleAssignment,
  ExistingCoverageResult,
} from '../types';
import { ANALYSIS_STRATEGIES } from '../constants';
import { defaultPermissionCatalog, PermissionCatalog } from './permissionCatalog';
import { calculateCoverage } from './coverage';
import { runWeightedAnalysis } from './strategies';

/**
 * Collapse strategies that resolved to the same role set into a single
 * recommendation, labelling it with all the contributing strategy names
 * (e.g. "Minimize Excess / Balanced").
 */
const mergeDuplicateStrategies = (strategies: SuggestedRole[]): SuggestedRole[] => {
  const groupsBySignature = new Map<string, SuggestedRole[]>();

  strategies.forEach((strategy) => {
    const signature = JSON.stringify([...strategy.roleNames].sort());
    const group = groupsBySignature.get(signature);
    if (group) group.push(strategy);
    else groupsBySignature.set(signature, [strategy]);
  });

  const uniqueStrategies: SuggestedRole[] = [];
  groupsBySignature.forEach((group) => {
    if (group.length > 1 && group[0].roleNames.length > 0) {
      uniqueStrategies.push({
        ...group[0],
        strategy: group.map((s) => s.strategy).join(' / '),
        reasoning: 'Multiple strategies produced identical role assignments for this policy.',
      });
    } else {
      uniqueStrategies.push(group[0]);
    }
  });

  return uniqueStrategies;
};

/**
 * Analyze each legacy access policy and produce per-strategy role
 * recommendations (deduplicated where strategies agree).
 */
export const analyzePolicies = (
  policies: AccessPolicyEntry[],
  availableRoles: RoleDefinition[],
  catalog: PermissionCatalog = defaultPermissionCatalog
): MigrationAnalysis[] => {
  return policies.map((policy) => {
    const requiredActions = catalog.getRequiredActions(policy);
    const allRecommendations = ANALYSIS_STRATEGIES.map((strategy) =>
      runWeightedAnalysis(requiredActions, availableRoles, strategy, catalog)
    );

    return {
      originalPolicy: policy,
      recommendations: mergeDuplicateStrategies(allRecommendations),
    };
  });
};

/**
 * Determine how much of a policy's required access is already satisfied by the
 * principal's existing RBAC role assignments, honoring scope inheritance.
 */
export const analyzeExistingCoverage = (
  policy: AccessPolicyEntry,
  assignments: RoleAssignment[],
  availableRoles: RoleDefinition[],
  scopeFilter: string | undefined,
  catalog: PermissionCatalog = defaultPermissionCatalog
): ExistingCoverageResult => {
  const requiredActions = catalog.getRequiredActions(policy);

  const userAssignments = assignments.filter((a) => {
    if (a.properties.principalId.toLowerCase() !== policy.objectId.toLowerCase()) return false;
    if (!scopeFilter) return true;

    const scope = (a.properties.scope || '').toLowerCase();
    const target = scopeFilter.toLowerCase();
    if (!scope) return false;

    // RBAC inherits downward: an assignment applies to the vault if scoped to the
    // vault itself OR to any ancestor (root / subscription / resource group).
    // Assignments scoped to a child resource (a single secret/key) do NOT count.
    if (scope === target) return true;
    if (scope === '/') return true;
    return target.startsWith(scope + '/');
  });

  const covered = new Set<string>();
  const excess = new Set<string>();
  const roleMatches: ExistingCoverageResult['roleMatches'] = [];
  const processedRoles = new Set<string>();

  userAssignments.forEach((assignment) => {
    // roleDefinitionId is a full path (".../roleDefinitions/GUID") or a bare GUID.
    const roleDefId = assignment.properties.roleDefinitionId.split('/').pop();
    const roleDef = availableRoles.find((r) => r.name.toLowerCase() === roleDefId?.toLowerCase());
    if (!roleDef || processedRoles.has(roleDef.name.toLowerCase())) return;

    processedRoles.add(roleDef.name.toLowerCase());
    const { covered: c, excess: e } = calculateCoverage(requiredActions, roleDef, catalog);

    c.forEach((perm) => covered.add(perm));
    e.forEach((perm) => excess.add(perm));

    if (c.size > 0) {
      roleMatches.push({
        roleName: roleDef.properties.roleName,
        covered: Array.from(c),
        excess: Array.from(e),
      });
    }
  });

  const missing = Array.from(requiredActions).filter((p) => !covered.has(p));

  return {
    isFullyCovered: missing.length === 0,
    coveredPermissions: Array.from(covered),
    missingPermissions: missing,
    excessPermissions: Array.from(excess),
    roleMatches,
  };
};
