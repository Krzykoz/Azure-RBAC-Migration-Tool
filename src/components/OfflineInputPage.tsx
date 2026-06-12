import type { JSX } from 'solid-js';
import type { KeyVault, RoleDefinition } from '../types';

export interface OfflineInputPageProps {
    onStart: (vaults: KeyVault[], roles: RoleDefinition[]) => void;
    onBack: () => void;
    theme: 'light' | 'dark';
}

// Placeholder shell. The full paste-and-parse UI is built in the login/offline/manual phase.
export const OfflineInputPage = (props: OfflineInputPageProps): JSX.Element => (
    <div class="p-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
        <p>Offline input.</p>
        <button class="mt-4" onClick={() => props.onBack()}>
            Back
        </button>
    </div>
);
