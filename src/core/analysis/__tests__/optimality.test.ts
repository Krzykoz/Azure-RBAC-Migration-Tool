import { describe, expect, it } from 'vitest';
import { analyzePolicies } from '../engine';
import { runWeightedAnalysis } from '../strategies';
import { calculateCoverage } from '../coverage';
import { defaultPermissionCatalog as catalog } from '../permissionCatalog';
import { ANALYSIS_STRATEGIES, StrategyConfig } from '../../constants';
import { AccessPolicyEntry } from '../../types';
import { getBuiltInKeyVaultRoles } from '../../roles/builtIn';
import { LEGACY_KEY_VAULT_PERMISSIONS } from '../../permissions/legacy';
import { pickRecommendedIndex } from '../../presentation/recommendationPicker';
import { makePolicy } from '../../../testing/factories';

const roles = getBuiltInKeyVaultRoles();
const EPSILON = 1e-9;

const allOf = (category: string) =>
  LEGACY_KEY_VAULT_PERMISSIONS[category].filter((p) => p !== 'Purge' && p !== 'Release');

const defaultPick = (permissions: AccessPolicyEntry['permissions']) => {
  const [analysis] = analyzePolicies([makePolicy(permissions)], roles);
  return analysis.recommendations[pickRecommendedIndex(analysis.recommendations)];
};

// Access-policy templates mapped to built-in roles by Microsoft:
// https://learn.microsoft.com/azure/key-vault/general/rbac-migration#access-policy-templates-to-azure-roles-mapping
const MICROSOFT_TEMPLATES: Array<[string, AccessPolicyEntry['permissions'], string[]]> = [
  ['Key, Secret, Certificate Management', { keys: allOf('keys'), secrets: allOf('secrets'), certificates: allOf('certificates') }, ['Key Vault Administrator']],
  ['Key & Secret Management', { keys: allOf('keys'), secrets: allOf('secrets') }, ['Key Vault Crypto Officer', 'Key Vault Secrets Officer']],
  ['Secret & Certificate Management', { secrets: allOf('secrets'), certificates: allOf('certificates') }, ['Key Vault Certificates Officer', 'Key Vault Secrets Officer']],
  ['Key Management', { keys: allOf('keys') }, ['Key Vault Crypto Officer']],
  ['Secret Management', { secrets: allOf('secrets') }, ['Key Vault Secrets Officer']],
  ['Certificate Management', { certificates: allOf('certificates') }, ['Key Vault Certificates Officer']],
  ['SQL Server Connector / Exchange Online Customer Key', { keys: ['Get', 'List', 'WrapKey', 'UnwrapKey'] }, ['Key Vault Crypto Service Encryption User']],
];

describe('Microsoft access-policy template mapping (golden)', () => {
  it.each(MICROSOFT_TEMPLATES)('%s: default pick fully covers it with no more excess than the Microsoft roles', (_, permissions, microsoftRoles) => {
    const required = catalog.getRequiredActions(makePolicy(permissions));
    const mapped = roles.filter((role) => microsoftRoles.includes(role.properties.roleName));
    expect(mapped).toHaveLength(microsoftRoles.length);
    const microsoftExcess = new Set(mapped.flatMap((role) => [...calculateCoverage(required, role, catalog).excess]));

    const pick = defaultPick(permissions);
    expect(pick.confidence).toBe(100);
    expect(pick.excessPermissions.length).toBeLessThanOrEqual(microsoftExcess.size);
  });

  it('maps Azure Backup (custom role per Microsoft) to the least-privilege built-in pair, not Administrator', () => {
    const pick = defaultPick({ keys: ['Get', 'List', 'Backup'], secrets: ['Get', 'List', 'Backup'] });
    expect([...pick.roleNames].sort()).toEqual(['Key Vault Crypto User', 'Key Vault Secrets Officer']);
    expect(pick.confidence).toBe(100);
    expect(pick.excessPermissions).toHaveLength(13);
  });
});

const score = ({ weights }: StrategyConfig, covered: number, excess: number, roleCount: number) =>
  covered * weights.coverage - excess * weights.excess - Math.max(0, roleCount - 1) * weights.roleCount;

// Deterministic LCG so failures are reproducible.
const randomPolicies = (count: number, seed: number): AccessPolicyEntry[] => {
  const next = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  const policies: AccessPolicyEntry[] = [];
  while (policies.length < count) {
    const permissions: AccessPolicyEntry['permissions'] = {};
    for (const category of ['keys', 'secrets', 'certificates', 'storage'] as const) {
      const density = next() * 0.6;
      const picked = LEGACY_KEY_VAULT_PERMISSIONS[category].filter(() => next() < density);
      if (picked.length > 0) permissions[category] = picked;
    }
    if (Object.keys(permissions).length > 0) policies.push(makePolicy(permissions));
  }
  return policies;
};

describe('weighted strategies return the optimum of their own objective', () => {
  // Reference: brute force over every subset of the built-in roles that cover something.
  const cases = randomPolicies(150, 7).map((policy) => {
    const required = catalog.getRequiredActions(policy);
    const candidates = roles.map((role) => calculateCoverage(required, role, catalog)).filter((c) => c.covered.size > 0);
    const subsets = [];
    for (let mask = 1; mask < 1 << candidates.length; mask++) {
      const picked = candidates.filter((_, i) => mask & (1 << i));
      subsets.push({
        covered: new Set(picked.flatMap((c) => [...c.covered])).size,
        excess: new Set(picked.flatMap((c) => [...c.excess])).size,
        roleCount: picked.length,
      });
    }
    return { required, subsets };
  });

  it.each(ANALYSIS_STRATEGIES.map((config) => [config.name, config] as const))('%s', (_, config) => {
    for (const { required, subsets } of cases) {
      let best: { covered: number; score: number } | undefined;
      for (const s of subsets) {
        const candidate = { covered: s.covered, score: score(config, s.covered, s.excess, s.roleCount) };
        const better = !best || (config.coverageFirst && candidate.covered !== best.covered
          ? candidate.covered > best.covered
          : candidate.score > best.score + EPSILON);
        if (better) best = candidate;
      }

      const rec = runWeightedAnalysis(required, roles, config);
      if (!best || (!config.coverageFirst && best.score < config.threshold - EPSILON)) {
        expect(rec.roleNames).toEqual([]);
        continue;
      }
      const achieved = score(config, rec.coveredPermissions.length, rec.excessPermissions.length, rec.roleNames.length);
      if (config.coverageFirst) expect(rec.coveredPermissions.length).toBe(best.covered);
      expect(achieved).toBeCloseTo(best.score, 9);
    }
  });
});
