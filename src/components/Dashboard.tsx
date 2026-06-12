import type { JSX } from 'solid-js';
import type { KeyVault, RoleDefinition } from '../types';

export interface DashboardProps {
    armToken: string;
    graphToken?: string;
    theme: 'light' | 'dark';
    offlineData?: { vaults: KeyVault[]; roles: RoleDefinition[] } | null;
}

// Placeholder shell. The full workspace is built in the dashboard and results phases.
export const Dashboard = (_props: DashboardProps): JSX.Element => (
    <div class="p-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
        Migration workspace.
    </div>
);
