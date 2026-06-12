import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@solidjs/testing-library';
import { OfflineInputPage } from '../OfflineInputPage';
import * as parser from '../../services/azureResponseParser';
import * as roleNormalization from '../../utils/roleNormalization';

vi.mock('../../services/azureResponseParser', () => ({ parseKeyVaultResponse: vi.fn() }));
vi.mock('../../utils/roleNormalization', () => ({ normalizeRoleDefinitions: vi.fn() }));

const noop = () => {};
const policyJson = JSON.stringify({ objectId: 'u1', permissions: { secrets: ['Get'] } });
const rolesJson = JSON.stringify([{ properties: { roleName: 'R' } }]);

describe('OfflineInputPage', () => {
    beforeEach(() => vi.clearAllMocks());

    it('returns to the previous screen via Back', () => {
        const onBack = vi.fn();
        const { getByLabelText } = render(() => (
            <OfflineInputPage onStart={noop} onBack={onBack} theme="light" />
        ));
        fireEvent.click(getByLabelText('Back'));
        expect(onBack).toHaveBeenCalledTimes(1);
    });

    it('requires both inputs', () => {
        const onStart = vi.fn();
        const { getByText } = render(() => (
            <OfflineInputPage onStart={onStart} onBack={noop} theme="light" />
        ));
        fireEvent.click(getByText('Analyze'));
        expect(getByText(/Both Vault Data and Role Data are required/)).toBeInTheDocument();
        expect(onStart).not.toHaveBeenCalled();
    });

    it('parses a single access policy and starts analysis', () => {
        const fakeVault = { id: 'v', name: 'Offline-Vault-Input', accessPolicies: [] };
        const fakeRoles = [{ name: 'role-1' }];
        (parser.parseKeyVaultResponse as any).mockReturnValue(fakeVault);
        (roleNormalization.normalizeRoleDefinitions as any).mockReturnValue(fakeRoles);

        const onStart = vi.fn();
        const { getByText, getByPlaceholderText } = render(() => (
            <OfflineInputPage onStart={onStart} onBack={noop} theme="light" />
        ));
        fireEvent.input(getByPlaceholderText('Paste Access Policies JSON here...'), {
            target: { value: policyJson },
        });
        fireEvent.input(getByPlaceholderText('Paste Role Definitions JSON here...'), {
            target: { value: rolesJson },
        });
        fireEvent.click(getByText('Analyze'));

        expect(onStart).toHaveBeenCalledWith([fakeVault], fakeRoles);
    });

    it('shows an error for malformed JSON', () => {
        const onStart = vi.fn();
        const { getByText, getByPlaceholderText } = render(() => (
            <OfflineInputPage onStart={onStart} onBack={noop} theme="light" />
        ));
        fireEvent.input(getByPlaceholderText('Paste Access Policies JSON here...'), {
            target: { value: '{ not json' },
        });
        fireEvent.input(getByPlaceholderText('Paste Role Definitions JSON here...'), {
            target: { value: rolesJson },
        });
        fireEvent.click(getByText('Analyze'));

        expect(getByText(/^Invalid JSON:/)).toBeInTheDocument();
        expect(onStart).not.toHaveBeenCalled();
    });

    it('reports when no role definitions are found', () => {
        (parser.parseKeyVaultResponse as any).mockReturnValue({ id: 'v', accessPolicies: [] });
        (roleNormalization.normalizeRoleDefinitions as any).mockReturnValue([]);
        const onStart = vi.fn();
        const { getByText, getByPlaceholderText } = render(() => (
            <OfflineInputPage onStart={onStart} onBack={noop} theme="light" />
        ));
        fireEvent.input(getByPlaceholderText('Paste Access Policies JSON here...'), {
            target: { value: policyJson },
        });
        fireEvent.input(getByPlaceholderText('Paste Role Definitions JSON here...'), {
            target: { value: rolesJson },
        });
        fireEvent.click(getByText('Analyze'));

        expect(getByText(/No valid Role Definitions found/)).toBeInTheDocument();
        expect(onStart).not.toHaveBeenCalled();
    });
});
