import { describe, it, expect } from 'vitest';
import {
  groupResultsByType,
  flattenInDisplayOrder,
  toCoverageChartData,
} from '../identityGrouping';
import { ResolvedNames } from '../identity';
import { MigrationAnalysis, SuggestedRole } from '../../types';
import { makePolicy } from '../../test/factories';

const rec = (over: Partial<SuggestedRole> = {}): SuggestedRole => ({
  strategy: 'Balanced',
  roleName: 'Role',
  roleNames: ['Role'],
  confidence: 100,
  reasoning: '',
  coveredPermissions: [],
  missingPermissions: [],
  excessPermissions: [],
  roleBreakdown: [],
  ...over,
});

const analysis = (policy: Parameters<typeof makePolicy>[1], r = rec()): MigrationAnalysis => ({
  originalPolicy: makePolicy({ secrets: ['Get'] }, policy),
  recommendations: [r],
});

const names: ResolvedNames = {
  app: { name: 'App', type: 'Application' },
  sp: { name: 'SP', type: 'ServicePrincipal' },
  grp: { name: 'Group', type: 'Group' },
  usr: { name: 'User', type: 'User' },
};

describe('groupResultsByType', () => {
  it('buckets by resolved type and gives compound identities precedence', () => {
    const groups = groupResultsByType(
      [
        analysis({ objectId: 'app', type: 'Application' }),
        analysis({ objectId: 'sp', type: 'ServicePrincipal' }),
        analysis({ objectId: 'sp', applicationId: 'app', type: 'ServicePrincipal' }), // compound
        analysis({ objectId: 'grp', type: 'Group' }),
        analysis({ objectId: 'usr', type: 'User' }),
        analysis({ objectId: 'ghost', type: 'Unknown' }),
      ],
      names
    );
    expect(groups.Application).toHaveLength(1);
    expect(groups.ServicePrincipal).toHaveLength(1);
    expect(groups.CompoundIdentity).toHaveLength(1);
    expect(groups.Group).toHaveLength(1);
    expect(groups.User).toHaveLength(1);
    expect(groups.Unknown).toHaveLength(1);
  });
});

describe('flattenInDisplayOrder', () => {
  it('orders App → SP → Compound → Group → User → Unknown', () => {
    const groups = groupResultsByType(
      [
        analysis({ objectId: 'ghost', type: 'Unknown' }),
        analysis({ objectId: 'usr', type: 'User' }),
        analysis({ objectId: 'app', type: 'Application' }),
        analysis({ objectId: 'sp', applicationId: 'app', type: 'ServicePrincipal' }),
      ],
      names
    );
    const order = flattenInDisplayOrder(groups).map((r) => r.originalPolicy.objectId);
    expect(order).toEqual(['app', 'sp', 'usr', 'ghost']);
  });
});

describe('toCoverageChartData', () => {
  it('derives coverage/excess/missing percentages and the display name', () => {
    const a = analysis(
      { objectId: 'usr', type: 'User' },
      rec({
        confidence: 80,
        coveredPermissions: ['a', 'b', 'c', 'd'],
        excessPermissions: ['x'],
        missingPermissions: ['y'],
        roleName: 'Key Vault Secrets User',
      })
    );
    const [datum] = toCoverageChartData([a], {}, names);
    expect(datum.name).toBe('User');
    expect(datum.coveragePct).toBe(80);
    expect(datum.excessPct).toBe(20); // 1 / (4 covered + 1 excess)
    expect(datum.missingPct).toBe(20); // 1 / (4 covered + 1 missing)
    expect(datum.rawMissing).toBe(1);
    expect(datum.rawExcess).toBe(1);
    expect(datum.role).toBe('Key Vault Secrets User');
  });

  it('falls back to a truncated objectId when no name resolves', () => {
    const [datum] = toCoverageChartData(
      [analysis({ objectId: '0123456789abcdef', type: 'Unknown' })],
      {},
      names
    );
    expect(datum.name).toBe('01234567');
  });

  it('honors the selected strategy index', () => {
    const a: MigrationAnalysis = {
      originalPolicy: makePolicy({ secrets: ['Get'] }, { objectId: 'usr' }),
      recommendations: [rec({ confidence: 10 }), rec({ confidence: 90 })],
    };
    const [datum] = toCoverageChartData([a], { 'usr::': 1 }, names);
    expect(datum.coveragePct).toBe(90);
  });
});
