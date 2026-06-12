import type { JSX } from 'solid-js';

export interface LoginScreenProps {
    onLogin: (armToken: string, graphToken: string) => void;
    onOffline: () => void;
    onManual: () => void;
    theme: 'light' | 'dark';
    onToggleTheme: () => void;
}

// Placeholder shell. The full token-entry UI is built in the login/offline/manual phase.
export const LoginScreen = (props: LoginScreenProps): JSX.Element => (
    <div class="p-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
        <p>Sign in to continue.</p>
        <div class="mt-4 flex justify-center gap-3">
            <button onClick={() => props.onLogin('', '')}>Connect</button>
            <button onClick={() => props.onManual()}>Manual Mode</button>
            <button onClick={() => props.onOffline()}>Offline Mode</button>
        </div>
    </div>
);
