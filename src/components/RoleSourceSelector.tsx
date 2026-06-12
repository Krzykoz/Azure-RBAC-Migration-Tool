import { For, Show, type JSX } from 'solid-js';
import { Subscription } from '../types';
import { LoaderIcon } from './Icons';
import { CopyableCommand } from './ui';
import { RoleSource } from '../hooks/useManualRoles';

const TOKEN_COMMAND =
    'az account get-access-token --resource https://management.azure.com -o tsv --query accessToken';

const SOURCE_OPTIONS: [RoleSource, string][] = [
    ['builtin', 'Built-in (offline)'],
    ['paste', 'Paste JSON'],
    ['token', 'Live token'],
];

interface RoleSourceSelectorProps {
    roleSource: RoleSource;
    onSelectSource: (source: RoleSource) => void;
    sourceStatus: string;

    // Paste source
    pasteJson: string;
    onChangePasteJson: (value: string) => void;
    pasteError: string | null;

    // Live token source
    token: string;
    onChangeToken: (value: string) => void;
    subscriptions: Subscription[];
    selectedSubId: string;
    onSelectSubscription: (id: string) => void;
    loadingSubs: boolean;
    loadingRoles: boolean;
    tokenError: string | null;
    onLoadSubscriptions: () => void;
    onLoadRoles: () => void;
}

export const RoleSourceSelector = (props: RoleSourceSelectorProps): JSX.Element => {
    return (
        <div class="mb-6">
            <div class="flex items-center justify-between mb-2 flex-wrap gap-2">
                <h3 class="text-sm font-bold text-neutral-800 dark:text-neutral-200">Role source</h3>
                <span class="text-xs text-neutral-400">{props.sourceStatus}</span>
            </div>

            <div class="inline-flex flex-wrap gap-1 p-1 rounded-lg bg-neutral-100 dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-700">
                <For each={SOURCE_OPTIONS}>
                    {([value, label]) => (
                        <button
                            type="button"
                            aria-pressed={props.roleSource === value}
                            onClick={() => props.onSelectSource(value)}
                            class={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                                props.roleSource === value
                                    ? 'bg-white dark:bg-neutral-700 text-brand-600 dark:text-white shadow-sm'
                                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
                            }`}
                        >
                            {label}
                        </button>
                    )}
                </For>
            </div>

            <Show when={props.roleSource === 'paste'}>
                <div class="mt-3 max-w-2xl">
                    <textarea
                        value={props.pasteJson}
                        onInput={(e) => props.onChangePasteJson(e.currentTarget.value)}
                        placeholder="Paste Role Definitions JSON (az role definition list output)..."
                        class="w-full h-32 p-3 font-mono text-xs rounded-sm bg-neutral-50 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 focus:border-brand-600 focus:ring-1 focus:ring-brand-600 outline-none resize-y"
                    />
                    <Show when={props.pasteError}>
                        <p class="text-xs text-red-600 font-medium mt-1">{props.pasteError}</p>
                    </Show>
                </div>
            </Show>

            <Show when={props.roleSource === 'token'}>
                <div class="mt-3 max-w-2xl space-y-2">
                    <CopyableCommand command={TOKEN_COMMAND} commandId="manual-token" />
                    <textarea
                        value={props.token}
                        onInput={(e) => props.onChangeToken(e.currentTarget.value)}
                        placeholder="Paste Management token..."
                        class="w-full h-20 p-3 font-mono text-xs rounded-sm bg-neutral-50 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 focus:border-brand-600 focus:ring-1 focus:ring-brand-600 outline-none resize-none"
                    />
                    <div class="flex items-center gap-2 flex-wrap">
                        <button
                            onClick={() => props.onLoadSubscriptions()}
                            disabled={props.loadingSubs}
                            class="px-3 py-1.5 rounded text-xs font-medium bg-neutral-600 hover:bg-neutral-700 text-white flex items-center gap-2 disabled:opacity-50"
                        >
                            <Show when={props.loadingSubs}>
                                <LoaderIcon class="animate-spin w-3.5 h-3.5" />
                            </Show>
                            Load subscriptions
                        </button>
                        <Show when={props.subscriptions.length > 0}>
                            <select
                                value={props.selectedSubId}
                                onChange={(e) => props.onSelectSubscription(e.currentTarget.value)}
                                class="flex-1 min-w-[140px] text-xs p-2 rounded bg-neutral-50 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 outline-none"
                            >
                                <For each={props.subscriptions}>
                                    {(s) => <option value={s.subscriptionId}>{s.displayName}</option>}
                                </For>
                            </select>
                            <button
                                onClick={() => props.onLoadRoles()}
                                disabled={props.loadingRoles}
                                class="px-3 py-1.5 rounded text-xs font-medium bg-brand-600 hover:bg-brand-700 text-white flex items-center gap-2 disabled:opacity-50"
                            >
                                <Show when={props.loadingRoles}>
                                    <LoaderIcon class="animate-spin w-3.5 h-3.5" />
                                </Show>
                                Load roles
                            </button>
                        </Show>
                    </div>
                    <Show when={props.tokenError}>
                        <p class="text-xs text-red-600 font-medium">{props.tokenError}</p>
                    </Show>
                </div>
            </Show>
        </div>
    );
};
