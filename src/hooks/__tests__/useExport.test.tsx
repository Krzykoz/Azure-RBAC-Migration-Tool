import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRoot } from 'solid-js';
import { useExport } from '../useExport';
import { makePolicy } from '../../test/factories';
import { getPolicyKey } from '../../utils/policyKey';
import * as exportUtils from '../../utils/exportUtils';
import * as htmlExport from '../../utils/htmlExport';

vi.mock('../../utils/exportUtils', () => ({
    exportToCSV: vi.fn(() => 'CSV'),
    exportToJSON: vi.fn(() => 'JSON'),
    exportToPowerShell: vi.fn(() => 'PS'),
    downloadFile: vi.fn(),
}));
vi.mock('../../utils/htmlExport', () => ({ exportToHtml: vi.fn(() => 'HTML') }));

const p1 = makePolicy({ secrets: ['get'] }, { objectId: 'a' });
const p2 = makePolicy({ secrets: ['get'] }, { objectId: 'b' });
const results = [
    { originalPolicy: p1, recommendations: [] },
    { originalPolicy: p2, recommendations: [] },
];

const baseProps = (selected: Set<string>) => ({
    results: () => results as any,
    selectedRoles: () => ({}),
    resolvedNames: () => ({}),
    selectedForExport: () => selected,
    vaultName: () => 'myvault',
    subscriptionId: () => 'sub1',
    vaultResourceId: () => '/vid',
    theme: () => 'light' as const,
});

describe('useExport', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('alert', vi.fn());
    });

    it('alerts and returns false when nothing is selected', () => {
        createRoot((dispose) => {
            const e = useExport(baseProps(new Set()));
            expect(e.handleExport('csv')).toBe(false);
            expect(alert).toHaveBeenCalledTimes(1);
            expect(exportUtils.downloadFile).not.toHaveBeenCalled();
            dispose();
        });
    });

    it('exports only the selected identities and closes the menu', () => {
        createRoot((dispose) => {
            const e = useExport(baseProps(new Set([getPolicyKey(p1)])));
            e.setShowExportMenu(true);
            expect(e.handleExport('csv')).toBe(true);

            const passed = (exportUtils.exportToCSV as any).mock.calls[0][0];
            expect(passed).toHaveLength(1);
            expect(passed[0].originalPolicy.objectId).toBe('a');
            expect(exportUtils.downloadFile).toHaveBeenCalledWith(
                'CSV',
                expect.stringMatching(/^myvault-migration-.*\.csv$/),
                'text/csv'
            );
            expect(e.showExportMenu()).toBe(false);
            dispose();
        });
    });

    it('routes each format to the matching exporter', () => {
        createRoot((dispose) => {
            const e = useExport(baseProps(new Set([getPolicyKey(p1), getPolicyKey(p2)])));

            e.handleExport('json');
            expect(exportUtils.exportToJSON).toHaveBeenCalled();
            expect(exportUtils.downloadFile).toHaveBeenLastCalledWith(
                'JSON',
                expect.stringMatching(/\.json$/),
                'application/json'
            );

            e.handleExport('powershell');
            expect(exportUtils.exportToPowerShell).toHaveBeenCalled();
            expect(exportUtils.downloadFile).toHaveBeenLastCalledWith(
                'PS',
                expect.stringMatching(/\.ps1$/),
                'text/plain'
            );

            e.handleExport('html');
            expect(htmlExport.exportToHtml).toHaveBeenCalled();
            expect(exportUtils.downloadFile).toHaveBeenLastCalledWith(
                'HTML',
                expect.stringMatching(/^myvault-analysis-.*\.html$/),
                'text/html'
            );
            dispose();
        });
    });
});
