import { createSignal, Show, type JSX } from 'solid-js';
import { validateToken } from '../services/azureService';
import { WifiOffIcon, ShieldCheckIcon } from './Icons';
import { CopyableCommand } from './ui';

interface LoginScreenProps {
    onLogin: (armToken: string, graphToken: string) => void;
    onOffline: () => void;
    onManual: () => void;
    theme: 'light' | 'dark';
    onToggleTheme: () => void;
}

export const LoginScreen = (props: LoginScreenProps): JSX.Element => {
    const [armToken, setArmToken] = createSignal('');
    const [graphToken, setGraphToken] = createSignal('');
    const [loading, setLoading] = createSignal(false);
    const [error, setError] = createSignal('');

    const handleLogin = async () => {
        // Capture both values up front so validation and onLogin use the same token
        // even if the field is edited while validation is in flight.
        const currentArmToken = armToken();
        const currentGraphToken = graphToken();
        if (!currentArmToken) return;

        setLoading(true);
        setError('');

        try {
            await validateToken(currentArmToken);
            props.onLogin(currentArmToken, currentGraphToken);
        } catch (e: any) {
            setError(e.message || 'Unknown error occurred');
        } finally {
            setLoading(false);
        }
    };

    const armCommand =
        'az account get-access-token --resource https://management.azure.com -o tsv --query accessToken';
    const graphCommand =
        'az account get-access-token --resource https://graph.microsoft.com -o tsv --query accessToken';

    return (
        <div class="min-h-screen flex items-center justify-center p-4 bg-neutral-100 dark:bg-neutral-900">
            <div class="relative max-w-[500px] w-full bg-white dark:bg-neutral-800 shadow-fluent p-8 rounded-lg border border-neutral-200 dark:border-neutral-700 my-8 max-h-[90vh] overflow-y-auto">
                <div class="flex flex-col items-start mb-6">
                    <div class="flex items-center justify-between gap-4 mb-2 w-full">
                        <span class="font-semibold text-lg text-neutral-800 dark:text-neutral-200">
                            Migration Assistant
                        </span>
                        <div class="flex items-center gap-2">
                            <button
                                onClick={() => props.onManual()}
                                class="bg-neutral-700 hover:bg-neutral-800 text-white text-xs font-semibold py-1.5 px-3 rounded-sm transition-colors flex items-center gap-1.5 shadow-sm"
                                aria-label="Use Manual Mode"
                            >
                                <ShieldCheckIcon class="w-3.5 h-3.5" />
                                Manual Mode
                            </button>
                            <button
                                onClick={() => props.onOffline()}
                                class="bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold py-1.5 px-3 rounded-sm transition-colors flex items-center gap-1.5 shadow-sm"
                                aria-label="Use Offline Mode"
                            >
                                <WifiOffIcon class="w-3.5 h-3.5" />
                                Offline Mode
                            </button>
                        </div>
                    </div>
                    <h2 class="text-2xl font-semibold text-neutral-900 dark:text-white mt-2">
                        Connect to Azure
                    </h2>
                    <p class="text-neutral-600 dark:text-neutral-400 text-sm mt-1">
                        This tool runs entirely in your browser. Tokens are not stored.
                    </p>
                </div>

                <div class="space-y-6">
                    {/* ARM Token Section */}
                    <div>
                        <label class="block text-sm font-bold text-neutral-800 dark:text-neutral-200 mb-1.5">
                            1. Management Token <span class="text-red-500">*</span>
                        </label>
                        <p class="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
                            Required for listing Subscriptions, Vaults, and Access Policies.
                        </p>
                        <CopyableCommand command={armCommand} commandId="arm" />
                        <textarea
                            value={armToken()}
                            onInput={(e) => setArmToken(e.currentTarget.value)}
                            placeholder="Paste Management token..."
                            class="w-full h-20 p-3 rounded-sm bg-white dark:bg-neutral-900 border border-neutral-400 hover:border-neutral-600 dark:border-neutral-600 dark:hover:border-neutral-400 focus:border-brand-600 focus:ring-1 focus:ring-brand-600 outline-none text-xs font-mono text-neutral-800 dark:text-neutral-200 resize-none transition-colors placeholder-neutral-500"
                        />
                    </div>

                    {/* Graph Token Section */}
                    <div>
                        <label class="block text-sm font-bold text-neutral-800 dark:text-neutral-200 mb-1.5">
                            2. Graph Token <span class="text-neutral-400 font-normal">(Optional)</span>
                        </label>
                        <p class="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
                            Required to see <strong>Names</strong> instead of GUIDs.
                        </p>
                        <CopyableCommand command={graphCommand} commandId="graph" />
                        <textarea
                            value={graphToken()}
                            onInput={(e) => setGraphToken(e.currentTarget.value)}
                            placeholder="Paste Graph token..."
                            class="w-full h-20 p-3 rounded-sm bg-white dark:bg-neutral-900 border border-neutral-400 hover:border-neutral-600 dark:border-neutral-600 dark:hover:border-neutral-400 focus:border-brand-600 focus:ring-1 focus:ring-brand-600 outline-none text-xs font-mono text-neutral-800 dark:text-neutral-200 resize-none transition-colors placeholder-neutral-500"
                        />
                    </div>

                    <Show when={error()}>
                        <p class="text-xs text-red-600 font-bold bg-red-50 dark:bg-red-900/20 p-2 rounded border border-red-100 dark:border-red-900">
                            {error()}
                        </p>
                    </Show>

                    <div class="flex flex-col items-end gap-3 pt-2">
                        <button
                            onClick={handleLogin}
                            disabled={loading() || !armToken()}
                            class="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold py-2 px-6 rounded-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                        >
                            {loading() ? 'Verifying...' : 'Connect'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
