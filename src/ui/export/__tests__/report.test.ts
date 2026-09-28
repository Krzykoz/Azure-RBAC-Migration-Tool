import { describe, it, expect } from 'vitest';
import { runInNewContext } from 'node:vm';
import { exportToHtml } from '../report';
import { MigrationAnalysis, SuggestedRole, AccessPolicyEntry } from '../../../core/types';
import { ResolvedNames } from '../../../core/identity/identity';

const makeRec = (over: Partial<SuggestedRole> = {}): SuggestedRole => ({
  strategy: 'Balanced',
  roleName: 'Key Vault Secrets User',
  roleNames: ['Key Vault Secrets User'],
  confidence: 100,
  reasoning: 'Covers all requested secret permissions.',
  coveredPermissions: [],
  missingPermissions: [],
  excessPermissions: [],
  roleBreakdown: [],
  ...over,
});

const makeAnalysis = (policy: Partial<AccessPolicyEntry>, recs: SuggestedRole[]): MigrationAnalysis => ({
  originalPolicy: { tenantId: 't', objectId: 'u1', type: 'User', permissions: { secrets: ['Get'] }, ...policy },
  recommendations: recs,
});

const report = (
  results: MigrationAnalysis[],
  selectedRoles: Record<string, number> = {},
  resolvedNames: ResolvedNames = {},
  over: Partial<Parameters<typeof exportToHtml>[3]> = {}
) => exportToHtml(results, selectedRoles, resolvedNames, { theme: 'light', vaultName: 'v', subscriptionId: 's', css: '', ...over });

const alice: ResolvedNames = { u1: { name: 'Alice', type: 'User' } };

// Runs the report's inline script against a minimal DOM built from the rendered markup.
const runReport = (html: string) => {
  const elements = [...html.matchAll(/<(?:div|g|button)\b([^>]*\bdata-(?:tab-)?row="[^"]+"[^>]*)>/g)].map((match) => {
    const attributes: Record<string, string> = Object.fromEntries(
      [...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((attr) => [attr[1], attr[2]])
    );
    return {
      attributes,
      getAttribute: (name: string) => attributes[name] ?? null,
      hasAttribute: (name: string) => name in attributes,
      setAttribute: (name: string, value: string) => { attributes[name] = value; },
      toggleAttribute: (name: string, force: boolean) => {
        if (force) attributes[name] = '';
        else delete attributes[name];
      },
      closest() { return this; },
    };
  });
  const stats = Object.fromEntries(
    [...html.matchAll(/id="(stat-[\w-]+)"[^>]*>([^<]*)</g)].map((match) => [match[1], { textContent: match[2] }])
  );
  const matching = (selector: string) => {
    if (selector === '[data-coverage]:not([hidden])') {
      return elements.filter((el) => 'data-coverage' in el.attributes && !('hidden' in el.attributes));
    }
    const [, name, value] = selector.match(/^\[(data-(?:tab-)?row)="([^"]+)"\]$/)!;
    return elements.filter((el) => el.attributes[name] === value);
  };
  const rootClasses = new Set<string>();
  let onClick: (event: { target: unknown }) => void = () => {};
  const document = {
    documentElement: { classList: { toggle: (name: string) => (rootClasses.has(name) ? rootClasses.delete(name) : rootClasses.add(name)) } },
    addEventListener: (_: string, handler: typeof onClick) => { onClick = handler; },
    getElementById: (id: string) => stats[id],
    querySelectorAll: matching,
  };
  runInNewContext(html.match(/<script>([\s\S]*)<\/script>/)![1], { document });
  const panels = (row: string) => elements.filter((el) => el.attributes['data-row'] === row);
  return {
    stats: (id: string) => stats[id].textContent,
    visibleIdx: (row: string) => [...new Set(panels(row).filter((el) => !('hidden' in el.attributes)).map((el) => el.attributes['data-idx']))],
    pressedIdx: (row: string) => elements.find((el) => el.attributes['data-tab-row'] === row && el.attributes['aria-pressed'] === 'true')?.attributes['data-idx'],
    select: (row: string, idx: number) => onClick({
      target: elements.find((el) => el.attributes['data-tab-row'] === row && el.attributes['data-idx'] === String(idx)),
    }),
    toggleTheme: () => onClick({ target: { closest: () => ({ hasAttribute: () => true }) } }),
    rootClasses,
  };
};

describe('exportToHtml', () => {
  it('produces a self-contained document with the app CSS inlined', () => {
    const html = report([makeAnalysis({}, [makeRec()])], {}, alice, { css: '.x{color:red}</style><b>' });

    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('<style>.x{color:red}<\\/style><b></style>');
    expect(html.match(/<script>/g)).toHaveLength(1);
    expect(html).not.toMatch(/<link[^>]+href=/i);
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toMatch(/<img\b/i);
    expect(html).not.toMatch(/https?:\/\/(?!www\.w3\.org)/i);
  });

  it('embeds the identity, vault, subscription and identity group', () => {
    const html = report([makeAnalysis({}, [makeRec()])], {}, alice, { vaultName: 'myvault', subscriptionId: 'sub-123' });

    expect(html).toContain('Alice');
    expect(html).toContain('u1');
    expect(html).toContain('Analysis: myvault');
    expect(html).toContain('sub-123');
    expect(html).toContain('<title>Key Vault RBAC Analysis - myvault</title>');
    expect(html).toMatch(/Users <span[^>]*>\(1\)<\/span>/);
  });

  it('renders compound identities with "on behalf of", the application id and a manual-migration warning', () => {
    const html = report(
      [makeAnalysis({ objectId: 'sp1', applicationId: 'app1', type: 'Application' }, [makeRec()])],
      {},
      { sp1: { name: 'MySP', type: 'ServicePrincipal' }, app1: { name: 'MyApp', type: 'Application' } }
    );

    expect(html).toContain('MySP on behalf of (MyApp)');
    expect(html).toContain('App ID: app1');
    expect(html).toContain('Compound Identities');
    expect(html).toContain('Manual migration required');
    expect(html).toContain('PowerShell export will skip this identity');
  });

  it('renders role chips, confidence and formatted covered/missing/excess permissions', () => {
    const html = report([makeAnalysis({}, [makeRec({
      roleNames: ['Key Vault Secrets User', 'Key Vault Crypto User'],
      confidence: 73,
      missingPermissions: ['Microsoft.KeyVault/vaults/secrets/setSecret/action'],
      roleBreakdown: [{
        roleName: 'Key Vault Secrets User',
        covered: ['Microsoft.KeyVault/vaults/secrets/getSecret/action'],
        excess: ['Microsoft.KeyVault/vaults/secrets/purge/action'],
      }],
    })])], {}, alice);

    expect(html).toContain('Key Vault Crypto User');
    expect(html).toContain('73%');
    expect(html).toContain('secrets/getSecret');
    expect(html).toContain('secrets/setSecret');
    expect(html).toContain('secrets/purge');
    expect(html).toContain('This is a privileged operation');
    expect(html).toContain('Missing Permissions');
  });

  it('collapses permissions beyond the visible limit into a native disclosure', () => {
    const covered = Array.from({ length: 8 }, (_, i) => `Microsoft.KeyVault/vaults/secrets/op${i}/action`);
    const html = report([makeAnalysis({}, [makeRec({ roleBreakdown: [{ roleName: 'R', covered, excess: [] }] })])]);

    expect(html).toMatch(/<details[^>]*><summary[^>]*><span[^>]*>\+2 more\.\.\.<\/span>/);
  });

  it('honors the selected strategy: its tab is pressed and only its panels are visible', () => {
    const html = report([makeAnalysis({}, [
      makeRec({ strategy: 'Max Coverage', roleName: 'Role A', roleNames: ['Role A'] }),
      makeRec({ strategy: 'Minimize Excess', roleName: 'Role B', roleNames: ['Role B'] }),
    ])], { 'u1::': 1 }, alice);
    const view = runReport(html);

    expect(view.pressedIdx('row0')).toBe('1');
    expect(view.visibleIdx('row0')).toEqual(['1']);
  });

  it('switches panels, chart bars and overview totals with each strategy tab', () => {
    const user = makeAnalysis({ objectId: 'u1' }, [
      makeRec({ strategy: 'Max Coverage', coveredPermissions: ['get', 'list'], excessPermissions: ['set', 'delete', 'purge'] }),
      makeRec({ strategy: 'Minimize Excess', confidence: 50, coveredPermissions: ['get'], missingPermissions: ['list'] }),
    ]);
    const app = makeAnalysis({ objectId: 'sp1', type: 'ServicePrincipal' }, [
      makeRec({ confidence: 25, coveredPermissions: ['get'], missingPermissions: ['list', 'set', 'delete'], excessPermissions: ['purge'] }),
      makeRec({ strategy: 'Max Coverage', confidence: 75, coveredPermissions: ['get', 'list', 'set'], missingPermissions: ['delete'], excessPermissions: ['purge', 'release'] }),
    ]);
    const view = runReport(report([user, app], { 'u1::': 1 }));
    const totals = () => [view.stats('stat-average'), view.stats('stat-missing'), view.stats('stat-excess')];

    expect(totals()).toEqual(['38%', '4', '1']);
    // Display order differs from input: the service principal is row0, the user row1.
    view.select('row1', 0);
    expect(totals()).toEqual(['63%', '3', '4']);
    expect(view.visibleIdx('row1')).toEqual(['0']);
    expect(view.pressedIdx('row1')).toBe('0');
    view.select('row0', 1);
    expect(totals()).toEqual(['88%', '1', '5']);
    view.select('row1', 1);
    expect(totals()).toEqual(['63%', '2', '2']);
  });

  it('keeps empty reports and identities without recommendations usable', () => {
    expect(report([])).toContain('No identities selected for export.');
    const html = report([
      makeAnalysis({ objectId: 'empty' }, []),
      makeAnalysis({ objectId: 'u1' }, [makeRec(), makeRec({ confidence: 50 })]),
    ], { 'empty::': 8, 'u1::': 8 });
    const view = runReport(html);

    expect(html).toContain('No recommendation available.');
    expect(view.stats('stat-average')).toBe('50%');
    view.select('row1', 1);
    expect(view.stats('stat-average')).toBe('25%');
  });

  it('starts in the chosen theme and ships a working theme toggle', () => {
    expect(report([], {}, {}, { theme: 'dark' })).toContain('<html lang="en" class="dark">');
    const html = report([makeAnalysis({}, [makeRec()])]);
    expect(html).toContain('<html lang="en" class="">');
    expect(html).toContain('data-theme-toggle');
    const view = runReport(html);
    view.toggleTheme();
    expect(view.rootClasses.has('dark')).toBe(true);
  });

  it('escapes dynamic values so they cannot inject markup', () => {
    const html = report(
      [makeAnalysis({}, [makeRec({ roleName: '<script>x</script>', roleNames: ['<b>R&D</b>'] })])],
      {},
      { u1: { name: 'A<b>"&\'', type: 'User' } },
      { vaultName: '<i>v</i>' }
    );

    expect(html).toContain('A&lt;b&gt;&quot;&amp;&#x27;');
    expect(html).toContain('&lt;b&gt;R&amp;D&lt;/b&gt;');
    expect(html).not.toContain('<b>R&D</b>');
    expect(html).not.toContain('<i>v</i>');
    expect(html.match(/<script>/g)).toHaveLength(1);
    expect(() => runReport(html)).not.toThrow();
  });

  it('shows existing direct-principal coverage and its limits', () => {
    const html = report([{
      ...makeAnalysis({}, [makeRec()]),
      existingCoverage: {
        isFullyCovered: true,
        coveredPermissions: ['Microsoft.KeyVault/vaults/secrets/getSecret/action'],
        missingPermissions: [],
        excessPermissions: [],
        roleMatches: [{ roleName: 'Key Vault Secrets User', covered: ['Microsoft.KeyVault/vaults/secrets/getSecret/action'], excess: [] }],
      },
    }], {}, alice);

    expect(html).toContain('Already Covered (Direct Principal)');
    expect(html).toContain('Fully Covered by Direct-Principal RBAC Assignments');
    expect(html).toContain('Group membership, management-group');
  });
});
