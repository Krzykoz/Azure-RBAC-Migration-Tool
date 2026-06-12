import { describe, it, expect } from 'vitest';
import { createPermissionCatalog } from '../permissionCatalog';
import { analyzePolicies } from '../engine';
import { ANALYSIS_STRATEGIES } from '../../constants';
import { runWeightedAnalysis } from '../strategies';
import { makePolicy, makeRole } from '../../../testing/factories';

// A tiny self-contained mapping CSV, independent of the bundled asset. This is
// the payoff of the DI refactor: the engine can be exercised against a catalog
// we fully control. Actions keep the "microsoft.keyvault" marker the coverage
// step looks for when collecting a role's Key Vault data actions.
const MINI_CSV = [
  'AccessPolicyPermission,RBACDataAction',
  'Secret Get,microsoft.keyvault/secrets/get',
  'Secret Set,microsoft.keyvault/secrets/set;microsoft.keyvault/secrets/update',
  'Key Read,microsoft.keyvault/keys/read',
].join('\n');

const catalog = createPermissionCatalog(MINI_CSV);

describe('createPermissionCatalog — injected mapping', () => {
  it('expands a policy using the injected CSV, not the bundled one', () => {
    const required = catalog.getRequiredActions(makePolicy({ secrets: ['Get', 'Set'] }));
    expect([...required].sort()).toEqual([
      'microsoft.keyvault/secrets/get',
      'microsoft.keyvault/secrets/set',
      'microsoft.keyvault/secrets/update',
    ]);
  });

  it('treats "All" as every mapped action in the category', () => {
    const required = catalog.getRequiredActions(makePolicy({ secrets: ['All'] }));
    expect([...required].sort()).toEqual([
      'microsoft.keyvault/secrets/get',
      'microsoft.keyvault/secrets/set',
      'microsoft.keyvault/secrets/update',
    ]);
  });

  it('exposes the known-action universe for membership checks', () => {
    expect(catalog.knownActions.has('microsoft.keyvault/keys/read')).toBe(true);
    expect(catalog.hasKnownActionLower('microsoft.keyvault/secrets/get')).toBe(true);
    expect(catalog.hasKnownActionLower('microsoft.keyvault/unknown/thing')).toBe(false);
  });
});

describe('engine with injected catalog', () => {
  it('drives analyzePolicies entirely from the custom catalog', () => {
    const role = makeRole('Mini Secrets', [
      'microsoft.keyvault/secrets/get',
      'microsoft.keyvault/secrets/set',
      'microsoft.keyvault/secrets/update',
    ]);

    const [analysis] = analyzePolicies([makePolicy({ secrets: ['Get'] })], [role], catalog);
    const rec = analysis.recommendations[0];
    expect(rec.coveredPermissions).toContain('microsoft.keyvault/secrets/get');
    expect(rec.missingPermissions).toEqual([]);
  });

  it('runWeightedAnalysis honors the injected catalog for wildcard excess', () => {
    const required = new Set(['microsoft.keyvault/secrets/get']);
    const star = makeRole('Star', ['microsoft.keyvault/secrets/*']);

    const rec = runWeightedAnalysis(required, [star], ANALYSIS_STRATEGIES[0], catalog);
    expect(rec.coveredPermissions).toContain('microsoft.keyvault/secrets/get');
    expect(rec.excessPermissions.sort()).toEqual([
      'microsoft.keyvault/secrets/set',
      'microsoft.keyvault/secrets/update',
    ]);
  });
});
