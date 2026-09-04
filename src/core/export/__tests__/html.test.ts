import { describe, it, expect } from 'vitest';
import { runInNewContext } from 'node:vm';
import { exportToHtml } from '../html';
import { MigrationAnalysis, SuggestedRole, IdentityType, AccessPolicyEntry } from '../../types';

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

const makeAnalysis = (
    policy: Partial<AccessPolicyEntry>,
    recs: SuggestedRole[]
): MigrationAnalysis => ({
    originalPolicy: {
        tenantId: 't',
        objectId: 'u1',
        type: 'User',
        permissions: { secrets: ['Get'] },
        ...policy,
    },
    recommendations: recs,
});

const resolved = (
    map: Record<string, { name: string; type: IdentityType }>
): Record<string, { name: string; type: IdentityType }> => map;

// Execute the actual inline script against the generated nodes without a browser dependency.
const runReport = (html: string) => {
    const nodes = [...html.matchAll(/<(?:div|g|button)\b([^>]*\bdata-row="[^"]+"[^>]*)>/g)].map((match) => {
        const attributes: Record<string, string> = Object.fromEntries(
            [...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((attr) => [attr[1], attr[2]])
        );
        if (/\shidden(?:\s|$)/.test(match[1])) attributes.hidden = '';
        const classes = new Set(attributes.class.split(' '));
        return {
            attributes,
            classes,
            getAttribute: (name: string) => attributes[name] ?? null,
            toggleAttribute(name: string, force: boolean) {
                if (force) attributes[name] = '';
                else delete attributes[name];
            },
            classList: {
                toggle(name: string, force: boolean) {
                    if (force) classes.add(name);
                    else classes.delete(name);
                },
            },
        };
    });
    const stats = Object.fromEntries(
        [...html.matchAll(/class="stat-value" id="([^"]+)">([^<]+)</g)].map((match) =>
            [match[1], { textContent: match[2] }]
        )
    );
    const handlers: Record<string, (event: { target: unknown }) => void> = {};
    const document = {
        documentElement: {},
        addEventListener: (event: string, handler: (event: { target: unknown }) => void) => { handlers[event] = handler; },
        getElementById: (id: string) => stats[id],
        querySelectorAll: (selector: string) => {
            if (selector === '.chart-strat:not([hidden])') {
                return nodes.filter((node) => node.classes.has('chart-strat') && !('hidden' in node.attributes));
            }
            const row = selector.match(/data-row="([^"]+)"/)?.[1];
            return nodes.filter((node) => node.attributes['data-row'] === row
                && ['strat', 'chart-strat'].some((cls) => node.classes.has(cls) && selector.includes(`.${cls}[`)));
        },
    };
    runInNewContext(html.match(/<script>([\s\S]*)<\/script>/)![1], { document });
    return {
        nodes,
        stats,
        select(row: string, idx: number) {
            const tabs = nodes.filter((node) => node.classes.has('tab') && node.attributes['data-row'] === row);
            const tab = tabs.find((node) => node.attributes['data-idx'] === String(idx))!;
            Object.assign(tab, { parentNode: { querySelectorAll: () => tabs } });
            handlers.click({ target: { closest: () => tab } });
        },
    };
};

describe('exportToHtml', () => {
    it('produces a fully self-contained HTML document with no external assets', () => {
        const html = exportToHtml(
            [makeAnalysis({ objectId: 'u1', type: 'User' }, [makeRec()])],
            {},
            resolved({ u1: { name: 'Alice', type: 'User' } }),
            'light',
            'myvault',
            'sub-123'
        );

        expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
        expect(html).toContain('<style>');
        expect(html).toContain('<script>');
        // No external stylesheet/script/image references.
        expect(html).not.toMatch(/<link[^>]+href=/i);
        expect(html).not.toMatch(/<script[^>]+src=/i);
        expect(html).not.toMatch(/<img\b/i);
        expect(html).not.toMatch(/https?:\/\/(?!www\.w3\.org)/i);
    });

    it('embeds the identity name, object id, vault and subscription', () => {
        const html = exportToHtml(
            [makeAnalysis({ objectId: 'u1', type: 'User' }, [makeRec()])],
            {},
            resolved({ u1: { name: 'Alice', type: 'User' } }),
            'light',
            'myvault',
            'sub-123'
        );

        expect(html).toContain('Alice');
        expect(html).toContain('u1');
        expect(html).toContain('Analysis: myvault');
        expect(html).toContain('sub-123');
        expect(html).toContain('Users <span class="group-count">(1)</span>');
    });

    it('renders compound identities with "on behalf of" and the application id', () => {
        const html = exportToHtml(
            [
                makeAnalysis({ objectId: 'sp1', applicationId: 'app1', type: 'Application' }, [
                    makeRec(),
                ]),
            ],
            {},
            resolved({
                sp1: { name: 'MySP', type: 'ServicePrincipal' },
                app1: { name: 'MyApp', type: 'Application' },
            }),
            'light',
            'v',
            's'
        );

        expect(html).toContain('MySP on behalf of (MyApp)');
        expect(html).toContain('App ID: app1');
        expect(html).toContain('Compound Identities <span class="group-count">(1)</span>');
        expect(html).toContain('Manual migration required');
        expect(html).toContain('cannot preserve the application restriction of a compound policy');
        expect(html).toContain('PowerShell export skips this identity');
        expect(html).toMatch(/<div class="banner banner-warning"><div class="banner-title">/);
    });

    it('renders role chips, confidence, and formatted covered/missing/excess permissions', () => {
        const rec = makeRec({
            roleNames: ['Key Vault Secrets User', 'Key Vault Crypto User'],
            confidence: 73,
            missingPermissions: ['Microsoft.KeyVault/vaults/secrets/setSecret/action'],
            roleBreakdown: [
                {
                    roleName: 'Key Vault Secrets User',
                    covered: ['Microsoft.KeyVault/vaults/secrets/getSecret/action'],
                    excess: ['Microsoft.KeyVault/vaults/secrets/purge/action'],
                },
            ],
        });
        const html = exportToHtml(
            [makeAnalysis({ objectId: 'u1', type: 'User' }, [rec])],
            {},
            resolved({ u1: { name: 'Alice', type: 'User' } }),
            'light',
            'v',
            's'
        );

        expect(html).toContain('Key Vault Secrets User');
        expect(html).toContain('Key Vault Crypto User');
        expect(html).toContain('73%');
        // formatPermissionLabel strips the Key Vault prefix + /action suffix.
        expect(html).toContain('secrets/getSecret');
        expect(html).toContain('secrets/setSecret');
        expect(html).toContain('secrets/purge');
        expect(html).toContain('Missing Permissions');
    });

    it('honors the selected strategy index by marking its tab active and hiding the others', () => {
        const analysis: MigrationAnalysis = {
            originalPolicy: { tenantId: 't', objectId: 'u1', type: 'User', permissions: {} },
            recommendations: [
                makeRec({ strategy: 'Max Coverage', roleName: 'Role A', roleNames: ['Role A'] }),
                makeRec({ strategy: 'Minimize Excess', roleName: 'Role B', roleNames: ['Role B'] }),
            ],
        };
        const html = exportToHtml(
            [analysis],
            { 'u1::': 1 },
            resolved({ u1: { name: 'Alice', type: 'User' } }),
            'light',
            'v',
            's'
        );

        // The selected (idx 1) tab is active; idx 0 panel is hidden, idx 1 is not.
        expect(html).toMatch(/<button class="tab tab-active"[^>]*data-idx="1"/);
        expect(html).toMatch(/<div class="strat" data-row="row0" data-idx="0" hidden>/);
        expect(html).toMatch(/<div class="strat" data-row="row0" data-idx="1">/);
    });

    it('switches chart bars and all overview totals along with each selected identity strategy', () => {
        const user = makeAnalysis({ objectId: 'u1' }, [
            makeRec({
                strategy: 'Max Coverage',
                coveredPermissions: ['get', 'list'],
                excessPermissions: ['set', 'delete', 'purge'],
            }),
            makeRec({
                strategy: 'Minimize Excess',
                confidence: 50,
                coveredPermissions: ['get'],
                missingPermissions: ['list'],
            }),
        ]);
        const app = makeAnalysis({ objectId: 'sp1', type: 'ServicePrincipal' }, [
            makeRec({
                confidence: 25,
                coveredPermissions: ['get'],
                missingPermissions: ['list', 'set', 'delete'],
                excessPermissions: ['purge'],
            }),
            makeRec({
                strategy: 'Max Coverage',
                confidence: 75,
                coveredPermissions: ['get', 'list', 'set'],
                missingPermissions: ['delete'],
                excessPermissions: ['purge', 'release'],
            }),
        ]);
        const html = exportToHtml([user, app], { 'u1::': 1 }, {}, 'light', 'v', 's');
        const report = runReport(html);
        const expectTotals = (average: string, missing: string, excess: string) => {
            expect(report.stats['stat-average'].textContent).toBe(average);
            expect(report.stats['stat-missing'].textContent).toBe(missing);
            expect(report.stats['stat-excess'].textContent).toBe(excess);
        };
        expectTotals('38%', '4', '1');
        // Display order differs from input: the application is row0, the user is row1.
        report.select('row1', 0);
        expectTotals('63%', '3', '4');
        for (const node of report.nodes.filter((n) => n.attributes['data-row'] === 'row1'
            && (n.classes.has('strat') || n.classes.has('chart-strat')))) {
            expect('hidden' in node.attributes).toBe(node.attributes['data-idx'] !== '0');
        }
        expect(report.nodes.filter((n) => n.classes.has('chart-strat') && !('hidden' in n.attributes)))
            .toHaveLength(2);
        expect(report.nodes.find((n) => n.classes.has('tab-active') && n.attributes['data-row'] === 'row1')
            ?.attributes['data-idx']).toBe('0');
        report.select('row0', 1);
        expectTotals('88%', '1', '5');
        report.select('row1', 1);
        expectTotals('63%', '2', '2');
        expect(html).toContain('.chart-strat[hidden]{display:none}');
        expect(html).toMatch(/<g class="chart-strat" data-row="row1" data-idx="1"[^>]*>[\s\S]*?height="130"/);
    });

    it('keeps empty reports and identities without recommendations usable', () => {
        const empty = runReport(exportToHtml([], {}, {}, 'light', 'v', 's'));
        expect(empty.stats['stat-average'].textContent).toBe('0%');
        const html = exportToHtml([
            makeAnalysis({ objectId: 'empty' }, []),
            makeAnalysis({ objectId: 'u1' }, [makeRec(), makeRec({ confidence: 50 })]),
        ], { 'empty::': 8, 'u1::': 8 }, {}, 'light', 'v', 's');
        const report = runReport(html);
        expect(html).toContain('No recommendation available.');
        expect(report.stats['stat-average'].textContent).toBe('50%');
        report.select('row1', 1);
        expect(report.stats['stat-average'].textContent).toBe('25%');
    });

    it('applies the dark theme class and ships a working theme toggle', () => {
        const htmlDark = exportToHtml(
            [makeAnalysis({ objectId: 'u1' }, [makeRec()])],
            {},
            resolved({ u1: { name: 'Alice', type: 'User' } }),
            'dark',
            'v',
            's'
        );
        const htmlLight = exportToHtml(
            [makeAnalysis({ objectId: 'u1' }, [makeRec()])],
            {},
            resolved({ u1: { name: 'Alice', type: 'User' } }),
            'light',
            'v',
            's'
        );

        expect(htmlDark).toContain('<html lang="en" class="dark">');
        expect(htmlLight).toContain('<html lang="en" class="">');
        expect(htmlDark).toContain('data-action="theme"');
    });

    it('ships responsive report styles and a scrollable minimum chart width', () => {
        const html = exportToHtml(
            [makeAnalysis({ objectId: 'u1' }, [makeRec()])],
            {},
            resolved({ u1: { name: 'Alice', type: 'User' } }),
            'light',
            'v',
            's'
        );

        expect(html).toContain('@media(max-width:1199px)');
        expect(html).toContain('@media(max-width:639px)');
        expect(html).toContain('.mapping-head{display:none}');
        expect(html).toContain('<div class="mobile-col-label">Recommended Role Combination</div>');
        expect(html).toContain('<svg width="320"');
    });

    it('HTML-escapes dynamic values to avoid broken markup or injection', () => {
        const html = exportToHtml(
            [
                makeAnalysis({ objectId: 'u1', type: 'User' }, [
                    makeRec({ roleName: '<script>x</script>', roleNames: ['<b>R&D</b>'] }),
                ]),
            ],
            {},
            resolved({ u1: { name: 'A<b>"&\'', type: 'User' } }),
            'light',
            'v',
            's'
        );

        expect(html).toContain('A&lt;b&gt;&quot;&amp;&#39;');
        expect(html).toContain('&lt;b&gt;R&amp;D&lt;/b&gt;');
        // The escaped role name must not appear as a live tag.
        expect(html).not.toContain('<b>R&D</b>');
        expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
        expect(html.match(/<script>/g)).toHaveLength(1);
        expect(() => runReport(html)).not.toThrow();
    });

    it('shows the existing-coverage banner for fully covered identities', () => {
        const analysis: MigrationAnalysis = {
            originalPolicy: {
                tenantId: 't',
                objectId: 'u1',
                type: 'User',
                permissions: { secrets: ['Get'] },
            },
            recommendations: [makeRec()],
            existingCoverage: {
                isFullyCovered: true,
                coveredPermissions: ['Microsoft.KeyVault/vaults/secrets/getSecret/action'],
                missingPermissions: [],
                excessPermissions: [],
                roleMatches: [
                    {
                        roleName: 'Key Vault Secrets User',
                        covered: ['Microsoft.KeyVault/vaults/secrets/getSecret/action'],
                        excess: [],
                    },
                ],
            },
        };
        const html = exportToHtml(
            [analysis],
            {},
            resolved({ u1: { name: 'Alice', type: 'User' } }),
            'light',
            'v',
            's'
        );

        expect(html).toContain('Already Covered');
        expect(html).toContain('Fully Covered by Direct-Principal RBAC Assignments');
        expect(html).toContain('Existing coverage reflects direct-principal role assignments only');
        expect(html).toContain('Group membership and management-group effective access are not calculated');
    });
});
