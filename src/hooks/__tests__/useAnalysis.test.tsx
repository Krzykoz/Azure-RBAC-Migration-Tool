import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'solid-js';
import { useAnalysis } from '../useAnalysis';
import { makePolicy, makeRole } from '../../test/factories';
import { getPolicyKey } from '../../utils/policyKey';
import * as analysisService from '../../services/analysisService';

vi.mock('../../services/analysisService', () => ({
    analyzePolicies: vi.fn(),
    analyzeExistingCoverage: vi.fn(),
}));

const userPolicy = makePolicy({ secrets: ['get'] }, { objectId: 'u1', type: 'User' });
const unknownPolicy = makePolicy({ secrets: ['get'] }, { objectId: 'x1', type: 'Unknown' });
const vault = (policies: any[]) => ({ id: 'v', name: 'v', location: '', sku: '', accessPolicies: policies });

const rec = (strategy: string, confidence: number) => ({
    strategy,
    roleName: 'R',
    roleNames: ['R'],
    confidence,
    reasoning: '',
    coveredPermissions: [],
    missingPermissions: [],
    excessPermissions: [],
    roleBreakdown: [],
});
const coverage = (isFullyCovered: boolean) => ({
    isFullyCovered,
    coveredPermissions: [],
    missingPermissions: [],
    excessPermissions: [],
    roleMatches: [],
});

describe('useAnalysis', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
    });
    afterEach(() => vi.useRealTimers());

    it('drops custom roles when includeCustomRoles is false', async () => {
        (analysisService.analyzePolicies as any).mockReturnValue([]);
        const builtin = makeRole('B', ['a'], { type: 'BuiltInRole' });
        const custom = makeRole('C', ['a'], { type: 'CustomRole' });
        await createRoot(async (dispose) => {
            const a = useAnalysis({
                selectedVault: () => vault([userPolicy]),
                availableRoles: () => [builtin, custom],
                roleAssignments: () => [],
                resolvedNames: () => ({}),
                includeCustomRoles: () => false,
            });
            const p = a.runAnalysis();
            vi.advanceTimersByTime(100);
            await p;
            expect(analysisService.analyzePolicies).toHaveBeenCalledWith([userPolicy], [builtin]);
            dispose();
        });
    });

    it('defaults to the highest-confidence strategy and excludes Unknown from export', async () => {
        (analysisService.analyzePolicies as any).mockReturnValue([
            { originalPolicy: userPolicy, recommendations: [rec('Max Coverage', 50), rec('Balanced', 80)] },
            { originalPolicy: unknownPolicy, recommendations: [rec('Balanced', 90)] },
        ]);
        (analysisService.analyzeExistingCoverage as any).mockReturnValue(coverage(false));
        await createRoot(async (dispose) => {
            const a = useAnalysis({
                selectedVault: () => vault([userPolicy, unknownPolicy]),
                availableRoles: () => [],
                roleAssignments: () => [],
                resolvedNames: () => ({}),
                includeCustomRoles: () => true,
            });
            const p = a.runAnalysis();
            vi.advanceTimersByTime(100);
            await p;

            expect(a.results()).toHaveLength(2);
            expect(a.selectedRoles()[getPolicyKey(userPolicy)]).toBe(1);
            expect(a.results()[0].existingCoverage).toEqual(coverage(false));
            expect(a.selectedForExport().has(getPolicyKey(userPolicy))).toBe(true);
            expect(a.selectedForExport().has(getPolicyKey(unknownPolicy))).toBe(false);
            dispose();
        });
    });

    it('clearResults resets results, selection, and export set', async () => {
        (analysisService.analyzePolicies as any).mockReturnValue([
            { originalPolicy: userPolicy, recommendations: [rec('Balanced', 90)] },
        ]);
        (analysisService.analyzeExistingCoverage as any).mockReturnValue(coverage(true));
        await createRoot(async (dispose) => {
            const a = useAnalysis({
                selectedVault: () => vault([userPolicy]),
                availableRoles: () => [],
                roleAssignments: () => [],
                resolvedNames: () => ({}),
                includeCustomRoles: () => true,
            });
            const p = a.runAnalysis();
            vi.advanceTimersByTime(100);
            await p;
            expect(a.results()).toHaveLength(1);

            a.clearResults();
            expect(a.results()).toEqual([]);
            expect(a.selectedRoles()).toEqual({});
            expect(a.selectedForExport().size).toBe(0);
            dispose();
        });
    });
});
