import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@solidjs/testing-library';
import { Dashboard } from '../Dashboard';
import { makePolicy, makeRole } from '../../test/factories';
import { KeyVault, MigrationAnalysis } from '../../types';
import * as azureService from '../../services/azureService';
import * as analysisService from '../../services/analysisService';

vi.mock('../../services/azureService', () => ({
    getSubscriptions: vi.fn(),
    getKeyVaults: vi.fn(),
    getRoleDefinitions: vi.fn(),
    getRoleAssignments: vi.fn(),
    resolveBatchIdentities: vi.fn(),
}));
vi.mock('../../services/analysisService', () => ({
    analyzePolicies: vi.fn(),
    analyzeExistingCoverage: vi.fn(),
}));

const offlineVault: KeyVault = {
    id: '/subscriptions/offline-sub/vaults/vault-one',
    name: 'vault-one',
    location: 'westus',
    sku: 'standard',
    accessPolicies: [makePolicy({ secrets: ['Get'] }, { objectId: 'u1', type: 'User', displayName: 'Alice' })],
};
const offlineData = {
    vaults: [offlineVault],
    roles: [makeRole('Key Vault Reader', ['a'], { type: 'BuiltInRole' })],
};

const analysisResult: MigrationAnalysis = {
    originalPolicy: offlineVault.accessPolicies[0],
    recommendations: [
        {
            strategy: 'Balanced',
            roleName: 'Key Vault Reader',
            roleNames: ['Key Vault Reader'],
            confidence: 95,
            reasoning: 'good fit',
            coveredPermissions: ['x'],
            missingPermissions: [],
            excessPermissions: [],
            roleBreakdown: [],
        },
    ],
};

describe('Dashboard (offline)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (analysisService.analyzePolicies as any).mockReturnValue([analysisResult]);
        (analysisService.analyzeExistingCoverage as any).mockReturnValue({
            isFullyCovered: false,
            coveredPermissions: [],
            missingPermissions: [],
            excessPermissions: [],
            roleMatches: [],
        });
    });

    it('walks subscription → vault → analysis → export menu', async () => {
        const { getByText } = render(() => (
            <Dashboard armToken="" theme="light" offlineData={offlineData} />
        ));

        expect(getByText('No Vault Selected')).toBeInTheDocument();

        fireEvent.click(getByText('Offline Subscription'));
        await waitFor(() => expect(getByText('vault-one')).toBeInTheDocument());

        fireEvent.click(getByText('vault-one'));
        await waitFor(() => expect(getByText('Ready to Analyze')).toBeInTheDocument());
        expect(getByText('Include Custom Roles')).toBeInTheDocument();

        fireEvent.click(getByText('Run Analysis'));
        await waitFor(() => expect(getByText('Analysis Complete')).toBeInTheDocument(), {
            timeout: 2000,
        });
        await waitFor(() => expect(getByText('Identity Mapping')).toBeInTheDocument(), {
            timeout: 2000,
        });
        expect(analysisService.analyzePolicies).toHaveBeenCalled();

        // Export menu is available once analysis completes.
        fireEvent.click(getByText('Export'));
        expect(getByText('Export as CSV')).toBeInTheDocument();
        expect(getByText('Export as POWERSHELL')).toBeInTheDocument();
    });

    it('does not lock the analyze controls before running', async () => {
        const { getByText } = render(() => (
            <Dashboard armToken="" theme="light" offlineData={offlineData} />
        ));
        fireEvent.click(getByText('Offline Subscription'));
        await waitFor(() => expect(getByText('vault-one')).toBeInTheDocument());
        fireEvent.click(getByText('vault-one'));
        await waitFor(() => expect(getByText('Run Analysis')).toBeInTheDocument());
        expect((getByText('Run Analysis').closest('button') as HTMLButtonElement).disabled).toBe(false);
    });
});

describe('Dashboard (online)', () => {
    beforeEach(() => vi.clearAllMocks());

    it('loads subscriptions from the management token', async () => {
        (azureService.getSubscriptions as any).mockResolvedValue([
            { id: 's1', displayName: 'Production', subscriptionId: 'sub-prod' },
        ]);
        const { getByText } = render(() => <Dashboard armToken="tok" theme="light" />);
        await waitFor(() => expect(getByText('Production')).toBeInTheDocument());
        expect(azureService.getSubscriptions).toHaveBeenCalledWith('tok');
        expect(getByText('No Vault Selected')).toBeInTheDocument();
    });
});
