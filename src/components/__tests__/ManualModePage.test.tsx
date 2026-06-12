import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@solidjs/testing-library';
import { ManualModePage } from '../ManualModePage';
import { makeRole } from '../../test/factories';
import * as builtInRoles from '../../utils/builtInRoles';
import * as analysisService from '../../services/analysisService';

vi.mock('../../utils/builtInRoles', () => ({ getBuiltInKeyVaultRoles: vi.fn() }));
vi.mock('../../services/analysisService', () => ({ analyzePolicies: vi.fn() }));

describe('ManualModePage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (builtInRoles.getBuiltInKeyVaultRoles as any).mockReturnValue([
            makeRole('Key Vault Reader', ['a']),
            makeRole('Key Vault Administrator', ['b']),
        ]);
    });

    it('shows the empty hint and built-in status by default', () => {
        const { getByText } = render(() => <ManualModePage onBack={() => {}} theme="light" />);
        expect(
            getByText('Select one or more permissions to see role suggestions.')
        ).toBeInTheDocument();
        expect(getByText('2 built-in roles loaded')).toBeInTheDocument();
    });

    it('computes live suggestions when a permission is selected', () => {
        (analysisService.analyzePolicies as any).mockReturnValue([
            {
                originalPolicy: { objectId: 'manual-selection' },
                recommendations: [
                    {
                        strategy: 'Balanced',
                        roleName: '',
                        roleNames: ['Key Vault Reader'],
                        confidence: 100,
                        reasoning: '',
                        coveredPermissions: [],
                        missingPermissions: [],
                        excessPermissions: [],
                        roleBreakdown: [],
                    },
                ],
            },
        ]);
        const { getByText, getAllByRole } = render(() => (
            <ManualModePage onBack={() => {}} theme="light" />
        ));
        // First checkbox is the Keys category toggle; the second is the first Keys permission.
        fireEvent.click(getAllByRole('checkbox')[1]);

        expect(analysisService.analyzePolicies).toHaveBeenCalled();
        const policyArg = (analysisService.analyzePolicies as any).mock.calls.at(-1)[0][0];
        expect(policyArg.objectId).toBe('manual-selection');
        expect(getByText('Key Vault Reader')).toBeInTheDocument();
    });

    it('returns to the previous screen via Back', () => {
        const onBack = vi.fn();
        const { getByLabelText } = render(() => <ManualModePage onBack={onBack} theme="light" />);
        fireEvent.click(getByLabelText('Back'));
        expect(onBack).toHaveBeenCalledTimes(1);
    });
});
