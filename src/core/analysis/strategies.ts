import { RoleDefinition, SuggestedRole, RoleBreakdown } from '../types';
import { StrategyConfig } from '../constants';
import { calculateCoverage } from './coverage';
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
 * Greedily add roles by marginal coverage minus excess and assignment cost.
 * Every addition must cover a new required action, bounding the number of passes
 * by the policy size rather than a fixed role limit. Max Coverage keeps adding
 * useful roles even when their excess makes the marginal score negative.
 */
export const runWeightedAnalysis = (
  required: Set<string>,
  roles: RoleDefinition[],
  config: StrategyConfig,
  catalog: PermissionCatalog = defaultPermissionCatalog
): SuggestedRole => {
  required = new Set(new Map(Array.from(required, (action) => [action.toLowerCase(), action])).values());
  const signatures = new Set<string>();
  const candidates = roles.map((role) => ({ role, ...calculateCoverage(required, role, catalog) }))
    .filter(({ covered, excess }) => {
      if (covered.size === 0) return false;
      const signature = JSON.stringify([[...covered].sort(), [...excess].sort()]);
      if (signatures.has(signature)) return false;
      signatures.add(signature);
      return true;
    });
  const selected: typeof candidates = [];
  const bestCovered = new Set<string>();
  const bestExcess = new Set<string>();

  // ponytail: greedy, not globally optimal; bounded by distinct required actions, not role subsets.
  while (bestCovered.size < required.size) {
    let best: (typeof candidates)[number] | undefined;
    let bestGain = -Infinity;
    for (const candidate of candidates) {
      const addedCoverage = [...candidate.covered].filter((action) => !bestCovered.has(action)).length;
      if (addedCoverage === 0) continue;
      const addedExcess = [...candidate.excess].filter((action) => !bestExcess.has(action)).length;
      const gain = addedCoverage * config.weights.coverage -
        addedExcess * config.weights.excess -
        (selected.length > 0 ? config.weights.roleCount : 0);
      if (gain > bestGain) {
        best = candidate;
        bestGain = gain;
      }
    }
    if (!best || (config.name !== 'Max Coverage' && bestGain < Math.max(0, config.threshold))) break;
    selected.push(best);
    best.covered.forEach((action) => bestCovered.add(action));
    best.excess.forEach((action) => bestExcess.add(action));
  }

  if (selected.length === 0) return noMatch(config, required);

  // Later choices may subsume an earlier role; don't export redundant assignments.
  for (let i = selected.length - 1; i >= 0; i--) {
    const others = new Set(selected.flatMap((candidate, index) => index === i ? [] : [...candidate.covered]));
    if ([...selected[i].covered].every((action) => others.has(action))) selected.splice(i, 1);
  }
  bestExcess.clear();
  selected.forEach((candidate) => candidate.excess.forEach((action) => bestExcess.add(action)));

  const roleBreakdown: RoleBreakdown[] = selected.map(({ role, covered, excess }) => ({
      roleName: role.properties.roleName,
      covered: Array.from(covered),
      excess: Array.from(excess),
  }));

  const roleNames = selected.map(({ role }) => role.properties.roleName);

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
