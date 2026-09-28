import { RoleDefinition, SuggestedRole } from '../types';
import { StrategyConfig } from '../constants';
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

interface Candidate extends RoleCoverage {
  role: RoleDefinition;
  coveredBits: bigint;
  excessBits: bigint;
}

const EPSILON = 1e-9;

const popCount32 = (n: number): number => {
  n -= (n >>> 1) & 0x55555555;
  n = (n & 0x33333333) + ((n >>> 2) & 0x33333333);
  return (((n + (n >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
};

/** Set bits in a BigInt, counted 32 bits at a time. */
const bitCount = (bits: bigint): number => {
  let count = 0;
  for (; bits; bits >>= 32n) count += popCount32(Number(bits & 0xffffffffn));
  return count;
};

const uniqueIgnoringCase = (actions: string[]): string[] =>
  Array.from(new Map(actions.map((action) => [action.toLowerCase(), action])).values());

/** Roles that cover something, minus interchangeable duplicates and roles another role beats outright. */
const toCandidates = (required: Set<string>, roles: RoleDefinition[], catalog: PermissionCatalog): Candidate[] => {
  const bitOf = new Map<string, bigint>();
  const toBits = (actions: Set<string>): bigint => {
    let bits = 0n;
    actions.forEach((action) => {
      const key = action.toLowerCase();
      if (!bitOf.has(key)) bitOf.set(key, 1n << BigInt(bitOf.size));
      bits |= bitOf.get(key)!;
    });
    return bits;
  };

  const signatures = new Set<string>();
  const candidates: Candidate[] = [];
  for (const role of roles) {
    const coverage = calculateCoverage(required, role, catalog);
    if (coverage.covered.size === 0) continue;
    const candidate = { role, ...coverage, coveredBits: toBits(coverage.covered), excessBits: toBits(coverage.excess) };
    const signature = `${candidate.coveredBits}/${candidate.excessBits}`;
    if (signatures.has(signature)) continue;
    signatures.add(signature);
    candidates.push(candidate);
  }

  // A role covering a subset of another's actions with a superset of its excess is never needed.
  return candidates.filter((b) => !candidates.some((a) => a !== b &&
    (b.coveredBits & ~a.coveredBits) === 0n && (a.excessBits & ~b.excessBits) === 0n));
};

/**
 * Find the role set with the best score for this strategy:
 * covered × coverage − excess × excess − (roles − 1) × roleCount.
 * `coverageFirst` strategies maximize coverage before score; the others report
 * No Match when even the best set scores below the threshold.
 */
const bestRoleSet = (required: Set<string>, candidates: Candidate[], config: StrategyConfig): SuggestedRole => {
  const { weights, coverageFirst } = config;
  const score = (covered: number, excess: number, roleCount: number) =>
    covered * weights.coverage - excess * weights.excess - Math.max(0, roleCount - 1) * weights.roleCount;

  // Initialized via `as` so TypeScript does not narrow it to undefined; `search` assigns it.
  let best = undefined as { picked: Candidate[]; covered: number; score: number } | undefined;
  const beats = (covered: number, value: number): boolean => !best ||
    (coverageFirst && covered !== best.covered ? covered > best.covered : value > best.score + EPSILON);

  // ponytail: exact set-cover branch-and-bound, exponential in the worst case; fine for the
  // ~10 built-ins plus tens of custom roles. Move to a worker or an ILP solver if tenants have hundreds.
  const search = (picked: Candidate[], allowed: Candidate[], coveredBits: bigint, excessBits: bigint): void => {
    const covered = bitCount(coveredBits);
    const excess = bitCount(excessBits);
    if (picked.length > 0 && beats(covered, score(covered, excess, picked.length))) {
      best = { picked, covered, score: score(covered, excess, picked.length) };
    }

    // Only roles adding new coverage can improve a set.
    const uncovered = ~coveredBits;
    const notExcess = ~excessBits;
    allowed = allowed.filter((c) => c.coveredBits & uncovered);
    const newExcess = allowed.map((c) => bitCount(c.excessBits & notExcess));
    let open = 0n;
    for (const c of allowed) open |= c.coveredBits & uncovered;

    // Branch on the open action the fewest roles cover. Covering an action forces at least the
    // least new excess among the roles covering it, which bounds what this subtree can score.
    const forced: number[] = [];
    let branchBit = 0n;
    let fewest = Infinity;
    for (let bits = open; bits; bits &= bits - 1n) {
      const bit = bits & -bits;
      let roles = 0;
      let least = Infinity;
      allowed.forEach((c, i) => {
        if (c.coveredBits & bit) {
          roles++;
          least = Math.min(least, newExcess[i]);
        }
      });
      forced.push(least);
      if (roles < fewest) [branchBit, fewest] = [bit, roles];
    }
    if (forced.length === 0) return;
    forced.sort((a, b) => a - b);
    // Optimistic bound: covering j more actions forces at least the j-th smallest forced excess.
    const maxCovered = covered + forced.length;
    const bound = coverageFirst
      ? score(maxCovered, excess + forced[forced.length - 1], picked.length)
      : Math.max(...forced.map((least, j) => score(covered + j + 1, excess + least, picked.length)));
    if (!beats(maxCovered, bound)) return;

    // Best marginal gain first, so good sets are found early and prune the rest.
    const options = allowed
      .flatMap((c, i) => (c.coveredBits & branchBit
        ? [{ c, gain: bitCount(c.coveredBits & uncovered) * weights.coverage - newExcess[i] * weights.excess }]
        : []))
      .sort((a, b) => b.gain - a.gain)
      .map(({ c }) => c);

    // Take each covering role in turn, ruling out the ones already tried so no set repeats.
    let rest = allowed;
    for (const option of options) {
      rest = rest.filter((c) => c !== option);
      search([...picked, option], rest, coveredBits | option.coveredBits, excessBits | option.excessBits);
    }
    // Or leave the action uncovered, which rules out every role covering it.
    if (!coverageFirst) search(picked, rest, coveredBits, excessBits);
  };
  search([], candidates, 0n, 0n);

  if (!best || (!coverageFirst && best.score < config.threshold - EPSILON)) return noMatch(config, required);

  const picked = [...best.picked].sort((a, b) => candidates.indexOf(a) - candidates.indexOf(b));
  const covered = new Set(picked.flatMap((c) => [...c.covered]));
  const roleNames = picked.map(({ role }) => role.properties.roleName);

  return {
    strategy: config.name,
    roleName: roleNames.join(' + '),
    roleNames,
    confidence: calculateConfidence(required.size, covered.size),
    reasoning: config.description,
    coveredPermissions: Array.from(covered),
    missingPermissions: Array.from(required).filter((action) => !covered.has(action)),
    excessPermissions: uniqueIgnoringCase(picked.flatMap((c) => [...c.excess])),
    roleBreakdown: picked.map(({ role, covered, excess }) => ({
      roleName: role.properties.roleName,
      covered: Array.from(covered),
      excess: Array.from(excess),
    })),
  };
};

/** Recommend a role set per strategy, sharing the per-role coverage work across strategies. */
export const recommendRoles = (
  required: Set<string>,
  roles: RoleDefinition[],
  strategies: readonly StrategyConfig[],
  catalog: PermissionCatalog = defaultPermissionCatalog
): SuggestedRole[] => {
  const normalized = new Set(uniqueIgnoringCase(Array.from(required)));
  const candidates = toCandidates(normalized, roles, catalog);
  return strategies.map((config) => bestRoleSet(normalized, candidates, config));
};

export const runWeightedAnalysis = (
  required: Set<string>,
  roles: RoleDefinition[],
  config: StrategyConfig,
  catalog: PermissionCatalog = defaultPermissionCatalog
): SuggestedRole => recommendRoles(required, roles, [config], catalog)[0];
