import { describe, it, expect } from 'vitest';
import { exportToCSV, exportToJSON, exportToPowerShell } from '../exportUtils';
import { MigrationAnalysis, SuggestedRole, IdentityType, AccessPolicyEntry } from '../../types';

const makeRec = (over: Partial<SuggestedRole> = {}): SuggestedRole => ({
  strategy: 'Balanced',
  roleName: 'Key Vault Secrets User',
  roleNames: ['Key Vault Secrets User'],
  confidence: 100,
  reasoning: '',
  coveredPermissions: [],
  missingPermissions: [],
  excessPermissions: [],
  roleBreakdown: [],
  ...over,
});

const makeAnalysis = (
  policy: Partial<AccessPolicyEntry>,
  rec: SuggestedRole
): MigrationAnalysis => ({
  originalPolicy: {
    tenantId: 't',
    objectId: 'u1',
    type: 'User',
    permissions: { secrets: ['Get'] },
    ...policy,
  },
  recommendations: [rec],
});

const resolved = (
  map: Record<string, { name: string; type: IdentityType }>
): Record<string, { name: string; type: IdentityType }> => map;

describe('exportToCSV', () => {
  it('emits a golden header + row for a simple user identity', () => {
    const csv = exportToCSV(
      [makeAnalysis({ objectId: 'u1', type: 'User' }, makeRec())],
      {},
      resolved({ u1: { name: 'Alice', type: 'User' } })
    );
    const lines = csv.split('\n');
    expect(lines[0]).toBe(
      'Identity Name,Object ID,Type,Strategy,Recommended Role,Confidence,Missing Permissions,Excess Permissions'
    );
    expect(lines[1]).toBe(
      '"Alice","u1","User","Balanced","Key Vault Secrets User","100%","0","0"'
    );
  });

  it('renders compound identities as "X on behalf of (App)" with type Compound Identity', () => {
    const csv = exportToCSV(
      [
        makeAnalysis(
          { objectId: 'sp1', applicationId: 'app1', type: 'Application' },
          makeRec()
        ),
      ],
      {},
      resolved({
        sp1: { name: 'MySP', type: 'ServicePrincipal' },
        app1: { name: 'MyApp', type: 'Application' },
      })
    );
    const row = csv.split('\n')[1];
    expect(row).toContain('"MySP on behalf of (MyApp)"');
    expect(row).toContain('"Compound Identity"');
  });

  it('neutralizes spreadsheet formula injection by prefixing a quote', () => {
    const csv = exportToCSV(
      [makeAnalysis({ objectId: 'u1' }, makeRec())],
      {},
      resolved({ u1: { name: '=cmd|/c calc', type: 'User' } })
    );
    expect(csv.split('\n')[1]).toContain(`"'=cmd|/c calc"`);
  });

  it('doubles embedded quotes per RFC 4180', () => {
    const csv = exportToCSV(
      [makeAnalysis({ objectId: 'u1' }, makeRec())],
      {},
      resolved({ u1: { name: 'A"B', type: 'User' } })
    );
    expect(csv.split('\n')[1]).toContain('"A""B"');
  });

  it('honors the selected strategy index from selectedRoles', () => {
    const analysis: MigrationAnalysis = {
      originalPolicy: { tenantId: 't', objectId: 'u1', type: 'User', permissions: {} },
      recommendations: [
        makeRec({ strategy: 'Max Coverage', roleName: 'Role A' }),
        makeRec({ strategy: 'Minimize Excess', roleName: 'Role B' }),
      ],
    };
    const csv = exportToCSV([analysis], { 'u1::': 1 }, resolved({ u1: { name: 'Alice', type: 'User' } }));
    expect(csv.split('\n')[1]).toContain('"Role B"');
  });
});

describe('exportToJSON', () => {
  it('produces structured records including resolved compound app info', () => {
    const json = exportToJSON(
      [
        makeAnalysis(
          { objectId: 'sp1', applicationId: 'app1', type: 'Application' },
          makeRec({ coveredPermissions: ['a'], missingPermissions: ['b'] })
        ),
      ],
      {},
      resolved({
        sp1: { name: 'MySP', type: 'ServicePrincipal' },
        app1: { name: 'MyApp', type: 'Application' },
      })
    );
    const parsed = JSON.parse(json);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].identity.name).toBe('MySP on behalf of (MyApp)');
    expect(parsed[0].identity.type).toBe('Compound Identity');
    expect(parsed[0].identity.applicationName).toBe('MyApp');
    expect(parsed[0].recommendation.roleName).toBe('Key Vault Secrets User');
    expect(parsed[0].recommendation.missingPermissions).toEqual(['b']);
  });
});

describe('exportToPowerShell', () => {
  it('emits New-AzRoleAssignment blocks under the right category header', () => {
    const ps = exportToPowerShell(
      [makeAnalysis({ objectId: 'u1', type: 'User' }, makeRec())],
      {},
      resolved({ u1: { name: 'Alice', type: 'User' } }),
      'myvault',
      'sub-123',
      '/subscriptions/sub-123/.../vaults/myvault'
    );
    expect(ps).toContain('$vaultName = "myvault"');
    expect(ps).toContain('# Users (1)');
    expect(ps).toContain('New-AzRoleAssignment');
    expect(ps).toContain('-ObjectId "u1"');
    expect(ps).toContain('-RoleDefinitionName "Key Vault Secrets User"');
    expect(ps).toContain('-Scope $scope');
  });

  it('classifies compound identities under "Compound Identities"', () => {
    const ps = exportToPowerShell(
      [makeAnalysis({ objectId: 'sp1', applicationId: 'app1', type: 'Application' }, makeRec())],
      {},
      resolved({ sp1: { name: 'MySP', type: 'ServicePrincipal' } }),
      'v',
      's'
    );
    expect(ps).toContain('# Compound Identities (1)');
  });

  it('flags identities with no matching role and warns on missing permissions', () => {
    const ps = exportToPowerShell(
      [
        makeAnalysis(
          { objectId: 'u1', type: 'User' },
          makeRec({ roleNames: [], roleName: 'No Match', missingPermissions: ['secrets/getSecret/action'] })
        ),
      ],
      {},
      resolved({ u1: { name: 'Alice', type: 'User' } }),
      'v',
      's'
    );
    expect(ps).toContain('# No matching role found for this identity');
    expect(ps).toContain('# WARNING: 1 permissions will NOT be covered:');
  });

  it('escapes PowerShell-special characters in objectId and role name fields', () => {
    const ps = exportToPowerShell(
      [
        makeAnalysis(
          { objectId: 'o$1', type: 'User' },
          makeRec({ roleNames: ['Role"X'], roleName: 'Role"X' })
        ),
      ],
      {},
      resolved({ u1: { name: 'Alice', type: 'User' } }),
      'v',
      's'
    );
    expect(ps).toContain('-ObjectId "o`$1"'); // $ -> `$
    expect(ps).toContain('-RoleDefinitionName "Role`"X"'); // " -> `"
  });
});
