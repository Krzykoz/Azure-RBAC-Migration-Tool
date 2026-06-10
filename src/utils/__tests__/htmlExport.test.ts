import { describe, it, expect } from 'vitest';
import { exportToHtml } from '../htmlExport';
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
        expect(html).toContain('Fully Covered via RBAC');
    });
});
