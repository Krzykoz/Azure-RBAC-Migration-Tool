import { describe, it, expect } from 'vitest';
import {
  analyzePolicies,
  analyzeExistingCoverage,
  runWeightedAnalysis,
} from '../index';
import { ANALYSIS_STRATEGIES } from '../../constants';
import { SuggestedRole } from '../../types';
import { makeRole, makePolicy, makeAssignment, ACTIONS } from '../../../testing/factories';

const byRoleNames = (recs: SuggestedRole[], roleNames: string[]) =>
  recs.find((r) => [...r.roleNames].sort().join(',') === [...roleNames].sort().join(','));

const strategyConfig = (name: string) => ANALYSIS_STRATEGIES.find((s) => s.name === name)!;

describe('analyzePolicies — legacy verb → RBAC expansion', () => {
  it('maps a single legacy verb to its RBAC data action and reports full coverage', () => {
    const policy = makePolicy({ secrets: ['Get'] });
    const role = makeRole('Exact Get', [ACTIONS.SECRET_GET]);

    const [analysis] = analyzePolicies([policy], [role]);
    // All three strategies collapse to the same single role, so they merge into one rec.
    expect(analysis.recommendations).toHaveLength(1);
    const rec = analysis.recommendations[0];
    expect(rec.coveredPermissions).toContain(ACTIONS.SECRET_GET);
    expect(rec.missingPermissions).toEqual([]);
    expect(rec.confidence).toBe(100);
    expect(rec.strategy).toContain('/'); // merged label e.g. "Max Coverage / Minimize Excess / Balanced"
  });

  it('expands "Set" into two RBAC actions (setSecret + update)', () => {
    const policy = makePolicy({ secrets: ['Set'] });
    const role = makeRole('Setter', [ACTIONS.SECRET_SET, ACTIONS.SECRET_UPDATE]);

    const [analysis] = analyzePolicies([policy], [role]);
    const rec = analysis.recommendations[0];
    expect(new Set(rec.coveredPermissions)).toEqual(
      new Set([ACTIONS.SECRET_SET, ACTIONS.SECRET_UPDATE])
    );
    expect(rec.missingPermissions).toEqual([]);
  });

  it('treats "All" in a category as every mapped action in that category', () => {
    const policy = makePolicy({ secrets: ['All'] });
    const admin = makeRole('Admin', [ACTIONS.VAULT_WILDCARD]);

    const [analysis] = analyzePolicies([policy], [admin]);
    const rec = analysis.recommendations[0];
    // Secrets category has 8 mapped actions in the CSV; all should be covered by vaults/*.
    expect(rec.coveredPermissions).toContain(ACTIONS.SECRET_GET);
    expect(rec.coveredPermissions).toContain(ACTIONS.SECRET_PURGE);
    expect(rec.missingPermissions).toEqual([]);
    expect(rec.confidence).toBe(100);
  });

  it('ignores roles with no Key Vault data actions', () => {
    const policy = makePolicy({ secrets: ['Get'] });
    const nonKv = makeRole('Storage Blob Reader', [
      'Microsoft.Storage/storageAccounts/blobServices/containers/read',
    ]);

    const [analysis] = analyzePolicies([policy], [nonKv]);
    // No KV role → "No Match" path.
    const rec = analysis.recommendations[0];
    expect(rec.roleNames).toEqual([]);
    expect(rec.confidence).toBe(0);
    expect(rec.missingPermissions).toContain(ACTIONS.SECRET_GET);
  });
});

describe('runWeightedAnalysis — strategy scoring differentiation', () => {
  // required = {getSecret, setSecret, update}; exact role misses `update`, star role covers all
  // but adds excess. This separates the three strategies.
  const required = new Set([ACTIONS.SECRET_GET, ACTIONS.SECRET_SET, ACTIONS.SECRET_UPDATE]);
  const exact = makeRole('ExactRole', [ACTIONS.SECRET_GET, ACTIONS.SECRET_SET]);
  const star = makeRole('StarRole', [ACTIONS.SECRETS_WILDCARD]);

  it('Max Coverage prioritises full coverage even with excess', () => {
    const rec = runWeightedAnalysis(required, [exact, star], strategyConfig('Max Coverage'));
    expect(rec.roleNames).toEqual(['StarRole']);
    expect(rec.missingPermissions).toEqual([]);
    expect(rec.confidence).toBe(100);
  });

  it('Minimize Excess avoids over-grant, leaving a gap', () => {
    const rec = runWeightedAnalysis(required, [exact, star], strategyConfig('Minimize Excess'));
    expect(rec.roleNames).toEqual(['ExactRole']);
    expect(rec.missingPermissions).toEqual([ACTIONS.SECRET_UPDATE]);
    expect(rec.confidence).toBe(67); // 2 of 3
  });

  it('Balanced lands on the low-excess option here', () => {
    const rec = runWeightedAnalysis(required, [exact, star], strategyConfig('Balanced'));
    expect(rec.roleNames).toEqual(['ExactRole']);
    expect(rec.confidence).toBe(67);
  });

  it('counts wildcard excess against the known action universe', () => {
    const rec = runWeightedAnalysis(required, [star], strategyConfig('Max Coverage'));
    // secrets/* also grants the other 6 known secret actions not in the requirement.
    expect(rec.excessPermissions).toContain(ACTIONS.SECRET_DELETE);
    expect(rec.excessPermissions).toContain(ACTIONS.SECRET_PURGE);
    expect(rec.excessPermissions).toContain(ACTIONS.SECRET_LIST);
    expect(rec.excessPermissions).toHaveLength(6);
  });
});

describe('runWeightedAnalysis — wildcard matching subtleties', () => {
  it('secrets/* matches children but NOT a sibling prefix (secretsbackup)', () => {
    const sibling = 'Microsoft.KeyVault/vaults/secretsbackup/read';
    const required = new Set([ACTIONS.SECRET_GET, sibling]);
    const star = makeRole('StarRole', [ACTIONS.SECRETS_WILDCARD]);

    const rec = runWeightedAnalysis(required, [star], strategyConfig('Max Coverage'));
    expect(rec.coveredPermissions).toContain(ACTIONS.SECRET_GET);
    expect(rec.missingPermissions).toContain(sibling);
  });

  it('respects notDataActions exclusions on wildcard roles', () => {
    const required = new Set([ACTIONS.SECRET_GET, ACTIONS.SECRET_DELETE]);
    const role = makeRole('NoDelete', [ACTIONS.SECRETS_WILDCARD], {
      notDataActions: [ACTIONS.SECRET_DELETE],
    });

    const rec = runWeightedAnalysis(required, [role], strategyConfig('Max Coverage'));
    expect(rec.coveredPermissions).toContain(ACTIONS.SECRET_GET);
    expect(rec.missingPermissions).toContain(ACTIONS.SECRET_DELETE);
  });

  it('returns a No Match when nothing meets the strategy threshold', () => {
    const required = new Set([ACTIONS.SECRET_GET]);
    const irrelevant = makeRole('KeysOnly', [ACTIONS.KEY_READ]);

    const rec = runWeightedAnalysis(required, [irrelevant], strategyConfig('Minimize Excess'));
    expect(rec.roleName).toBe('No Match');
    expect(rec.roleNames).toEqual([]);
    expect(rec.confidence).toBe(0);
  });
});

describe('analyzePolicies — duplicate strategy merging', () => {
  it('merges strategies that yield identical role sets into one labelled recommendation', () => {
    const policy = makePolicy({ secrets: ['Get'] });
    const role = makeRole('Exact Get', [ACTIONS.SECRET_GET]);

    const [analysis] = analyzePolicies([policy], [role]);
    expect(analysis.recommendations).toHaveLength(1);
    expect(analysis.recommendations[0].strategy).toBe(
      'Max Coverage / Minimize Excess / Balanced'
    );
  });

  it('keeps distinct recommendations when strategies disagree', () => {
    const policy = makePolicy({ secrets: ['Get', 'Set'] });
    const exact = makeRole('ExactRole', [ACTIONS.SECRET_GET, ACTIONS.SECRET_SET]);
    const star = makeRole('StarRole', [ACTIONS.SECRETS_WILDCARD]);

    const [analysis] = analyzePolicies([policy], [exact, star]);
    expect(analysis.recommendations).toHaveLength(2);
    expect(byRoleNames(analysis.recommendations, ['StarRole'])?.strategy).toBe('Max Coverage');
    expect(byRoleNames(analysis.recommendations, ['ExactRole'])?.strategy).toBe(
      'Minimize Excess / Balanced'
    );
  });
});

describe('analyzeExistingCoverage — RBAC scope inheritance', () => {
  const VAULT = '/subscriptions/s/resourceGroups/rg/providers/Microsoft.KeyVault/vaults/v';
  const policy = makePolicy({ secrets: ['Get'] }, { objectId: 'user1' });
  const roleDefGuid = 'guid-secret-get';
  const role = makeRole('Secret Getter', [ACTIONS.SECRET_GET], { name: roleDefGuid });
  const roleDefId = `/subscriptions/s/providers/Microsoft.Authorization/roleDefinitions/${roleDefGuid}`;

  it('counts an assignment scoped directly to the vault', () => {
    const res = analyzeExistingCoverage(
      policy,
      [makeAssignment('user1', roleDefId, VAULT)],
      [role],
      VAULT
    );
    expect(res.isFullyCovered).toBe(true);
    expect(res.coveredPermissions).toContain(ACTIONS.SECRET_GET);
  });

  it('counts a root-scoped assignment (inherits down to everything)', () => {
    const res = analyzeExistingCoverage(
      policy,
      [makeAssignment('user1', roleDefId, '/')],
      [role],
      VAULT
    );
    expect(res.isFullyCovered).toBe(true);
  });

  it('counts an ancestor (subscription) scope', () => {
    const res = analyzeExistingCoverage(
      policy,
      [makeAssignment('user1', roleDefId, '/subscriptions/s')],
      [role],
      VAULT
    );
    expect(res.isFullyCovered).toBe(true);
  });

  it('does NOT count an assignment scoped to a child resource', () => {
    const res = analyzeExistingCoverage(
      policy,
      [makeAssignment('user1', roleDefId, `${VAULT}/secrets/single-secret`)],
      [role],
      VAULT
    );
    expect(res.isFullyCovered).toBe(false);
    expect(res.missingPermissions).toContain(ACTIONS.SECRET_GET);
  });

  it('ignores assignments for a different principal', () => {
    const res = analyzeExistingCoverage(
      policy,
      [makeAssignment('someone-else', roleDefId, VAULT)],
      [role],
      VAULT
    );
    expect(res.isFullyCovered).toBe(false);
    expect(res.roleMatches).toEqual([]);
  });
});
