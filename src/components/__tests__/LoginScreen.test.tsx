import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@solidjs/testing-library';
import { LoginScreen } from '../LoginScreen';
import * as azureService from '../../services/azureService';

vi.mock('../../services/azureService', () => ({ validateToken: vi.fn() }));

const noop = () => {};

describe('LoginScreen', () => {
    beforeEach(() => vi.clearAllMocks());

    it('disables Connect until a management token is entered', () => {
        const { getByText, getByPlaceholderText } = render(() => (
            <LoginScreen
                onLogin={noop}
                onOffline={noop}
                onManual={noop}
                theme="light"
                onToggleTheme={noop}
            />
        ));
        const connect = getByText('Connect') as HTMLButtonElement;
        expect(connect.disabled).toBe(true);

        fireEvent.input(getByPlaceholderText('Paste Management token...'), {
            target: { value: 'arm-token' },
        });
        expect(connect.disabled).toBe(false);
    });

    it('validates the token and calls onLogin with both tokens', async () => {
        (azureService.validateToken as any).mockResolvedValue(undefined);
        const onLogin = vi.fn();
        const { getByText, getByPlaceholderText } = render(() => (
            <LoginScreen
                onLogin={onLogin}
                onOffline={noop}
                onManual={noop}
                theme="light"
                onToggleTheme={noop}
            />
        ));
        fireEvent.input(getByPlaceholderText('Paste Management token...'), {
            target: { value: 'arm-token' },
        });
        fireEvent.input(getByPlaceholderText('Paste Graph token...'), {
            target: { value: 'graph-token' },
        });
        fireEvent.click(getByText('Connect'));

        await waitFor(() => expect(onLogin).toHaveBeenCalledWith('arm-token', 'graph-token'));
        expect(azureService.validateToken).toHaveBeenCalledWith('arm-token');
    });

    it('shows the error message when validation fails', async () => {
        (azureService.validateToken as any).mockRejectedValue(new Error('Token expired'));
        const onLogin = vi.fn();
        const { getByText, getByPlaceholderText } = render(() => (
            <LoginScreen
                onLogin={onLogin}
                onOffline={noop}
                onManual={noop}
                theme="light"
                onToggleTheme={noop}
            />
        ));
        fireEvent.input(getByPlaceholderText('Paste Management token...'), {
            target: { value: 'bad' },
        });
        fireEvent.click(getByText('Connect'));

        await waitFor(() => expect(getByText('Token expired')).toBeInTheDocument());
        expect(onLogin).not.toHaveBeenCalled();
    });

    it('routes to manual and offline modes', () => {
        const onManual = vi.fn();
        const onOffline = vi.fn();
        const { getByText } = render(() => (
            <LoginScreen
                onLogin={noop}
                onOffline={onOffline}
                onManual={onManual}
                theme="light"
                onToggleTheme={noop}
            />
        ));
        fireEvent.click(getByText('Manual Mode'));
        expect(onManual).toHaveBeenCalledTimes(1);
        fireEvent.click(getByText('Offline Mode'));
        expect(onOffline).toHaveBeenCalledTimes(1);
    });
});
