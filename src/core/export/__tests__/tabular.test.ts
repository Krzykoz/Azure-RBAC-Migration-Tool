import { describe, it, expect } from 'vitest';
import { exportToCSV, exportToJSON, exportToPowerShell, parseVaultResourceId } from '../tabular';
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

const subscriptionId = '12345678-1234-1234-1234-123456789abc';
const vaultResourceId = `/subscriptions/${subscriptionId}/resourceGroups/my-rg/providers/Microsoft.KeyVault/vaults/myvault`;
const fullyCovered = {
  isFullyCovered: true,
  coveredPermissions: ['secrets/getSecret/action'],
  missingPermissions: [],
  excessPermissions: [],
  roleMatches: [],
};

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

  it('keeps compound and already-covered identities in both data exports', () => {
    const results = [
      makeAnalysis({ objectId: 'compound', applicationId: 'app1' }, makeRec()),
      { ...makeAnalysis({ objectId: 'covered' }, makeRec()), existingCoverage: fullyCovered },
    ];
    expect(JSON.parse(exportToJSON(results, {}, {})).map((r: { identity: { objectId: string } }) => r.identity.objectId))
      .toEqual(['compound', 'covered']);
    const csv = exportToCSV(results, {}, {});
    expect(csv.split('\n')).toHaveLength(3);
    expect(csv).toContain('"compound"');
    expect(csv).toContain('"covered"');
  });
});

describe('parseVaultResourceId', () => {
  it('extracts the actual vault name and subscription from a full resource ID', () => {
    expect(parseVaultResourceId(vaultResourceId)).toEqual({ subscriptionId, vaultName: 'myvault' });
    expect(parseVaultResourceId(vaultResourceId.toUpperCase())).toEqual({
      subscriptionId: subscriptionId.toUpperCase(),
      vaultName: 'MYVAULT',
    });
  });

  it.each([
    '',
    'myvault',
    '/subscriptions/offline-sub/resourceGroups/offline-rg/providers/Microsoft.KeyVault/vaults/myvault',
    vaultResourceId.replace(subscriptionId, 'not-a-guid'),
    vaultResourceId.replace('/resourceGroups/my-rg', ''),
    vaultResourceId.replace('my-rg', ''),
    vaultResourceId.replace('my-rg', 'bad group'),
    vaultResourceId.replace('my-rg', 'group.'),
    vaultResourceId.replace('Microsoft.KeyVault', 'Microsoft.Storage'),
    vaultResourceId.replace('myvault', 'bad--vault'),
    vaultResourceId.replace('myvault', '1invalid'),
    vaultResourceId.replace('myvault', 'ab'),
    vaultResourceId.replace('myvault', 'a'.repeat(25)),
    vaultResourceId.replace('myvault', 'Keyvault'),
    vaultResourceId.replace('Microsoft.KeyVault', 'Microsoft.KeyVault'),
    `${vaultResourceId}/secrets/child`,
    `${vaultResourceId}?api-version=2023-07-01`,
    `${vaultResourceId}\n`,
  ])('rejects invalid or synthetic scope %j with actionable guidance', (scope) => {
    expect(() => parseVaultResourceId(scope)).toThrow('Copy the Resource ID from the target vault in Azure');
    expect(() => exportToPowerShell([], {}, {}, 'myvault', subscriptionId, scope))
      .toThrow('valid full Key Vault resource ID');
  });
});

describe('exportToPowerShell', () => {
  it('emits New-AzRoleAssignment blocks under the right category header', () => {
    const ps = exportToPowerShell(
      [makeAnalysis({ objectId: 'u1', type: 'User' }, makeRec())],
      {},
      resolved({ u1: { name: 'Alice', type: 'User' } }),
      'myvault',
      subscriptionId,
      vaultResourceId
    );
    expect(ps).toContain('$vaultName = "myvault"');
    expect(ps).toContain('# Users (1)');
    expect(ps).toContain('New-AzRoleAssignment');
    expect(ps).toContain('-ObjectId "u1"');
    expect(ps).toContain('-RoleDefinitionName "Key Vault Secrets User"');
    expect(ps).toContain('-Scope $scope');
  });

  it('skips compound identities rather than dropping their application restriction', () => {
    const ps = exportToPowerShell(
      [makeAnalysis({ objectId: 'sp1', applicationId: 'app1', type: 'Application' }, makeRec())],
      {},
      resolved({ sp1: { name: 'MySP', type: 'ServicePrincipal' } }),
      'v',
      's',
      vaultResourceId
    );
    expect(ps).toContain('# Compound Identities (1)');
    expect(ps).toContain('# SKIPPED: Compound policy (applicationId: app1)');
    expect(ps).toContain('cannot preserve the application restriction');
    expect(ps).not.toContain('New-AzRoleAssignment');
  });

  it('skips fully covered identities while still assigning ordinary and partially covered identities', () => {
    const ps = exportToPowerShell(
      [
        { ...makeAnalysis({ objectId: 'covered' }, makeRec()), existingCoverage: fullyCovered },
        {
          ...makeAnalysis({ objectId: 'partial' }, makeRec()),
          existingCoverage: { ...fullyCovered, isFullyCovered: false, missingPermissions: ['secrets/setSecret/action'] },
        },
        makeAnalysis({ objectId: 'ordinary' }, makeRec()),
      ],
      {},
      {},
      'v',
      's',
      vaultResourceId
    );
    expect(ps).toContain('# SKIPPED: Already fully covered by existing direct-principal RBAC assignments');
    expect(ps).not.toContain('-ObjectId "covered"');
    expect(ps).toContain('-ObjectId "partial"');
    expect(ps).toContain('-ObjectId "ordinary"');
    expect(ps.match(/New-AzRoleAssignment/g)).toHaveLength(2);
  });

  it('does not require a recommendation for identities that must be skipped', () => {
    const ps = exportToPowerShell(
      [
        { ...makeAnalysis({ applicationId: 'app1' }, makeRec()), recommendations: [] },
        { ...makeAnalysis({}, makeRec()), existingCoverage: fullyCovered, recommendations: [] },
      ],
      {},
      {},
      'v',
      's',
      vaultResourceId
    );
    expect(ps.match(/# SKIPPED:/g)).toHaveLength(2);
    expect(ps).not.toContain('New-AzRoleAssignment');
  });

  it.each(['Key Vault Secrets User', 'key vault secrets user'])(
    'skips existing role %s in a partial combination and still assigns the missing role',
    (existingRole) => {
      const ps = exportToPowerShell(
        [{
          ...makeAnalysis({ objectId: 'partial' }, makeRec({
            roleNames: ['Key Vault Secrets User', 'Key Vault Crypto User'],
          })),
          existingCoverage: {
            ...fullyCovered,
            isFullyCovered: false,
            missingPermissions: ['keys/decrypt/action'],
            roleMatches: [{ roleName: existingRole, covered: ['secrets/getSecret/action'], excess: [] }],
          },
        }],
        {},
        {},
        'myvault',
        subscriptionId,
        vaultResourceId
      );
      expect(ps).toContain('# SKIPPED: Role "Key Vault Secrets User" is already present in direct-principal RBAC coverage');
      expect(ps).not.toContain('-RoleDefinitionName "Key Vault Secrets User"');
      expect(ps).toContain('-RoleDefinitionName "Key Vault Crypto User"');
      expect(ps).toContain('-ObjectId "partial"');
      expect(ps.match(/New-AzRoleAssignment/g)).toHaveLength(1);
      expect(ps).toContain('-Scope $scope `\n  -ErrorAction Stop');
    }
  );

  it('requires an explicit full scope instead of looking up or inventing an offline target', () => {
    expect(() => exportToPowerShell([], {}, {}, 'myvault', subscriptionId))
      .toThrow('valid full Key Vault resource ID');
  });

  it('uses scope-derived target details, sets context and stops on assignment errors', () => {
    const ps = exportToPowerShell(
      [makeAnalysis({}, makeRec())],
      {},
      {},
      'synthetic-vault',
      'offline-sub',
      vaultResourceId
    );
    expect(ps).toContain('# Vault: myvault');
    expect(ps).toContain(`$subscriptionId = "${subscriptionId}"`);
    expect(ps).toContain(`$scope = "${vaultResourceId}"`);
    expect(ps).not.toContain('synthetic-vault');
    expect(ps).not.toContain('offline-sub');
    expect(ps).not.toContain('Get-AzKeyVault');
    expect(ps).toContain('$ErrorActionPreference = "Stop"');
    expect(ps).toContain('Set-AzContext -SubscriptionId $subscriptionId -ErrorAction Stop | Out-Null');
    expect(ps).toContain('-Scope $scope `\n  -ErrorAction Stop');
    expect(ps.indexOf('Set-AzContext')).toBeLessThan(ps.indexOf('New-AzRoleAssignment'));
    expect(ps.indexOf('-Scope $scope')).toBeLessThan(ps.indexOf('Migration script completed'));
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
      's',
      vaultResourceId
    );
    expect(ps).toContain('# No matching role found for this identity');
    expect(ps).toContain('# WARNING: 1 permissions will NOT be covered:');
  });

  it.each(['\u201c', '\u201d', '\u201e'])('escapes PowerShell smart double quotes: %s', (quote) => {
    const ps = exportToPowerShell(
      [makeAnalysis({ objectId: `Object${quote}Id` }, makeRec({ roleNames: [`Role${quote}Name`] }))],
      {}, {}, 'v', 's', vaultResourceId
    );
    expect(ps).toContain('-RoleDefinitionName "Role`' + quote + 'Name"');
    expect(ps).toContain('-ObjectId "Object`' + quote + 'Id"');
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
      's',
      vaultResourceId
    );
    expect(ps).toContain('-ObjectId "o`$1"'); // $ -> `$
    expect(ps).toContain('-RoleDefinitionName "Role`"X"'); // " -> `"
  });
});
