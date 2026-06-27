import { RoleDefinition, SuggestedRole, RoleBreakdown } from '../types';
import { ANALYSIS_CONSTANTS, StrategyConfig } from '../constants';
import { calculateCoverage, RoleCoverage } from './coverage';
import { defaultPermissionCatalog, PermissionCatalog } from './permissionCatalog';

/**
 * Confidence reflects coverage only (how much of the policy the role set
 * satisfies). Excess permissions are reported separately so the user can review
 * over-grants. Result is clamped to 0–100.
 */
const calculateConfidence = (totalNeeded: number, covered: number): number => {
  if (totalNeeded === 0) return 100;
  return Math.max(0, Math.min(100, Math.round((covered / totalNeeded) * 100)));
};

const noMatch = (config: StrategyConfig, required: Set<string>): SuggestedRole => ({
  strategy: config.name,
  roleName: 'No Match',
  roleNames: [],
  confidence: 0,
  reasoning: `Could not find roles fitting the "${config.name}" criteria.`,
  coveredPermissions: [],
  missingPermissions: Array.from(required),
  excessPermissions: [],
  roleBreakdown: [],
});

/**
 * Find the best single- or multi-role combination for `required` under a given
 * strategy. Searches bounded role combinations (up to
 * {@link ANALYSIS_CONSTANTS.MAX_COMBINATION_SIZE}) and scores each as:
 *
 *   score = covered·Wcoverage − excess·Wexcess − (roleCount − 1)·WroleCount
 *
 * The highest-scoring combination above the strategy threshold wins; otherwise a
 * "No Match" recommendation is returned.
 */
export const runWeightedAnalysis = (
  required: Set<string>,
  roles: RoleDefinition[],
  config: StrategyConfig,
  catalog: PermissionCatalog = defaultPermissionCatalog
): SuggestedRole => {
  const maxCombinations = ANALYSIS_CONSTANTS.MAX_COMBINATION_SIZE;

  let bestCombination: RoleDefinition[] = [];
  let bestScore = -Infinity;
  let bestCovered = new Set<string>();
  let bestExcess = new Set<string>();

  // Precompute coverage for each role exactly once; the combination search reuses
  // these cached sets instead of recomputing coverage for every subset.
  const coverageCache = new Map<RoleDefinition, RoleCoverage>();
  const getCoverage = (role: RoleDefinition): RoleCoverage => {
    let entry = coverageCache.get(role);
    if (!entry) {
      entry = calculateCoverage(required, role, catalog);
      coverageCache.set(role, entry);
    }
    return entry;
  };

  const evaluateCombination = (combo: RoleDefinition[]) => {
    const combinedCovered = new Set<string>();
    const combinedExcess = new Set<string>();

    combo.forEach((role) => {
      const { covered, excess } = getCoverage(role);
      covered.forEach((c) => combinedCovered.add(c));
      excess.forEach((e) => combinedExcess.add(e));
    });

    const score =
      combinedCovered.size * config.weights.coverage -
      combinedExcess.size * config.weights.excess -
      (combo.length - 1) * config.weights.roleCount;

    if (score > bestScore) {
      bestScore = score;
      bestCombination = [...combo];
      bestCovered = combinedCovered;
      bestExcess = combinedExcess;
    }
  };

  const usefulRoles = roles.filter((r) => getCoverage(r).covered.size > 0);

  const generateCombinations = (startIdx: number, currentCombo: RoleDefinition[]) => {
    if (currentCombo.length > 0) evaluateCombination(currentCombo);
    if (currentCombo.length >= maxCombinations) return;

    for (let i = startIdx; i < usefulRoles.length; i++) {
      currentCombo.push(usefulRoles[i]);
      generateCombinations(i + 1, currentCombo);
      currentCombo.pop();
    }
  };

  generateCombinations(0, []);

  if (bestCombination.length === 0 || bestScore < config.threshold) {
    return noMatch(config, required);
  }

  const roleBreakdown: RoleBreakdown[] = bestCombination.map((role) => {
    const { covered, excess } = getCoverage(role);
    return {
      roleName: role.properties.roleName,
      covered: Array.from(covered),
      excess: Array.from(excess),
    };
  });

  const roleNames = bestCombination.map((r) => r.properties.roleName);

  return {
    strategy: config.name,
    roleName: roleNames.join(' + '),
    roleNames,
    confidence: calculateConfidence(required.size, bestCovered.size),
    reasoning: config.description,
    coveredPermissions: Array.from(bestCovered),
    missingPermissions: Array.from(required).filter((x) => !bestCovered.has(x)),
    excessPermissions: Array.from(bestExcess),
    roleBreakdown,
  };
};
