import { describe, it, expect } from 'vitest';
import {
  groupResultsByType,
  flattenInDisplayOrder,
  toCoverageChartRows,
  collectDisplayGroup,
  IDENTITY_DISPLAY_GROUPS,
} from '../grouping';
import { ResolvedNames } from '../identity';
import { MigrationAnalysis, SuggestedRole } from '../../types';
import { makePolicy } from '../../../testing/factories';

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

describe('IDENTITY_DISPLAY_GROUPS / collectDisplayGroup', () => {
  it('defines the display sections in canonical order', () => {
    expect(IDENTITY_DISPLAY_GROUPS.map((g) => g.label)).toEqual([
      'Applications & Service Principals',
      'Compound Identities',
      'Groups',
      'Users',
      'Unknown Identities',
    ]);
  });

  it('merges Application and ServicePrincipal buckets under one section', () => {
    const groups = groupResultsByType(
      [
        analysis({ objectId: 'app', type: 'Application' }),
        analysis({ objectId: 'sp', type: 'ServicePrincipal' }),
        analysis({ objectId: 'usr', type: 'User' }),
      ],
      names
    );
    const appsSection = IDENTITY_DISPLAY_GROUPS[0];
    expect(appsSection.keys).toEqual(['Application', 'ServicePrincipal']);
    const ids = collectDisplayGroup(groups, appsSection).map((r) => r.originalPolicy.objectId);
    expect(ids).toEqual(['app', 'sp']);
  });

  it('every display-group bucket covers each grouped result exactly once', () => {
    const groups = groupResultsByType(
      [
        analysis({ objectId: 'app', type: 'Application' }),
        analysis({ objectId: 'sp', applicationId: 'app', type: 'ServicePrincipal' }),
        analysis({ objectId: 'grp', type: 'Group' }),
        analysis({ objectId: 'usr', type: 'User' }),
        analysis({ objectId: 'ghost', type: 'Unknown' }),
      ],
      names
    );
    const collected = IDENTITY_DISPLAY_GROUPS.flatMap((g) => collectDisplayGroup(groups, g));
    expect(collected).toHaveLength(flattenInDisplayOrder(groups).length);
  });
});

describe('toCoverageChartRows', () => {
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
    const [[datum]] = toCoverageChartRows([a], names);
    expect(datum.name).toBe('User');
    expect(datum.coveragePct).toBe(80);
    expect(datum.excessPct).toBe(20); // 1 / (4 covered + 1 excess)
    expect(datum.missingPct).toBe(20); // 1 / (4 covered + 1 missing)
    expect(datum.rawMissing).toBe(1);
    expect(datum.rawExcess).toBe(1);
    expect(datum.role).toBe('Key Vault Secrets User');
  });

  it('falls back to a truncated objectId when no name resolves', () => {
    const [[datum]] = toCoverageChartRows([analysis({ objectId: '0123456789abcdef', type: 'Unknown' })], names);
    expect(datum.name).toBe('01234567');
  });

  it('keeps a datum per strategy, and an empty one when there is no recommendation', () => {
    const a: MigrationAnalysis = {
      originalPolicy: makePolicy({ secrets: ['Get'] }, { objectId: 'usr' }),
      recommendations: [rec({ confidence: 10 }), rec({ confidence: 90 })],
    };
    const [row, empty] = toCoverageChartRows([a, { ...a, recommendations: [] }], names);
    expect(row.map((d) => d.coveragePct)).toEqual([10, 90]);
    expect(empty).toEqual([expect.objectContaining({ coveragePct: 0, role: 'None' })]);
  });
});
