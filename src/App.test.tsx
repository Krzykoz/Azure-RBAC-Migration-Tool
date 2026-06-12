import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@solidjs/testing-library';

vi.mock('./components/Dashboard', () => ({
    Dashboard: (props: any) => (
        <div data-testid="dashboard">
            {`armToken=${props.armToken} offline=${props.offlineData ? 'yes' : 'no'}`}
        </div>
    ),
}));
vi.mock('./components/LoginScreen', () => ({
    LoginScreen: (props: any) => (
        <div data-testid="login">
            <button onClick={() => props.onLogin('arm-tok', 'graph-tok')}>do-login</button>
            <button onClick={() => props.onOffline()}>do-offline</button>
            <button onClick={() => props.onManual()}>do-manual</button>
        </div>
    ),
}));
vi.mock('./components/OfflineInputPage', () => ({
    OfflineInputPage: (props: any) => (
        <div data-testid="offline">
            <button onClick={() => props.onStart([{ id: 'v' }], [])}>do-start</button>
            <button onClick={() => props.onBack()}>off-back</button>
        </div>
    ),
}));
vi.mock('./components/ManualModePage', () => ({
    ManualModePage: (props: any) => (
        <div data-testid="manual">
            <button onClick={() => props.onBack()}>man-back</button>
        </div>
    ),
}));
vi.mock('./services/azureService', () => ({ getTenants: vi.fn().mockResolvedValue({}) }));

import App from './App';

describe('App routing and theme', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        document.documentElement.classList.remove('dark');
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('shows the login screen by default', () => {
        const { getByTestId } = render(() => <App />);
        expect(getByTestId('login')).toBeInTheDocument();
    });

    it('navigates to offline input and back to login', () => {
        const { getByTestId, getByText } = render(() => <App />);
        fireEvent.click(getByText('do-offline'));
        expect(getByTestId('offline')).toBeInTheDocument();
        fireEvent.click(getByText('off-back'));
        expect(getByTestId('login')).toBeInTheDocument();
    });

    it('navigates to manual mode and back to login', () => {
        const { getByTestId, getByText } = render(() => <App />);
        fireEvent.click(getByText('do-manual'));
        expect(getByTestId('manual')).toBeInTheDocument();
        fireEvent.click(getByText('man-back'));
        expect(getByTestId('login')).toBeInTheDocument();
    });

    it('logs in with a token and shows the dashboard', () => {
        const { getByTestId, getByText } = render(() => <App />);
        fireEvent.click(getByText('do-login'));
        const dashboard = getByTestId('dashboard');
        expect(dashboard).toBeInTheDocument();
        expect(dashboard.textContent).toContain('armToken=arm-tok');
        expect(dashboard.textContent).toContain('offline=no');
    });

    it('starts offline analysis and logs out via the header avatar', () => {
        const { getByTestId, getByText, getByTitle, queryByTestId } = render(() => <App />);
        fireEvent.click(getByText('do-offline'));
        fireEvent.click(getByText('do-start'));

        const dashboard = getByTestId('dashboard');
        expect(dashboard).toBeInTheDocument();
        expect(dashboard.textContent).toContain('offline=yes');
        // Offline mode surfaces an "Offline User" avatar in the header.
        expect(getByTitle('Sign out').textContent).toBe('O');

        fireEvent.click(getByTitle('Sign out'));
        expect(getByTestId('login')).toBeInTheDocument();
        expect(queryByTestId('dashboard')).toBeNull();
    });

    it('toggles theme and persists the choice to localStorage', () => {
        const { getByTitle } = render(() => <App />);
        expect(document.documentElement.classList.contains('dark')).toBe(false);

        fireEvent.click(getByTitle('Switch to dark mode'));
        expect(document.documentElement.classList.contains('dark')).toBe(true);
        expect(localStorage.theme).toBe('dark');

        fireEvent.click(getByTitle('Switch to light mode'));
        expect(document.documentElement.classList.contains('dark')).toBe(false);
        expect(localStorage.theme).toBe('light');
    });
});
