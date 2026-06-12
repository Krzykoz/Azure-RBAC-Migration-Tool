import { createSignal, For, Show, Switch, Match, type JSX } from 'solid-js';
import { Subscription, KeyVault } from '../types';
import { SearchIcon, LoaderIcon, KeyVaultIcon } from './Icons';

interface SidePanelProps {
    subscriptions: Subscription[];
    selectedSub: Subscription | null;
    onSelectSub: (sub: Subscription) => void;
    vaults: KeyVault[];
    selectedVault: KeyVault | null;
    onSelectVault: (vault: KeyVault) => void;
    isLoading: boolean;
}

export const SidePanel = (props: SidePanelProps): JSX.Element => {
    const [subSearch, setSubSearch] = createSignal('');
    const [vaultSearch, setVaultSearch] = createSignal('');

    const filteredSubs = () =>
        props.subscriptions.filter(
            (s) =>
                s.displayName.toLowerCase().includes(subSearch().toLowerCase()) ||
                s.subscriptionId.toLowerCase().includes(subSearch().toLowerCase())
        );

    const filteredVaults = () =>
        props.vaults.filter((v) => v.name.toLowerCase().includes(vaultSearch().toLowerCase()));

    return (
        <div class="lg:col-span-3 flex flex-col gap-4">
            {/* Subscription Card */}
            <div class="bg-white dark:bg-neutral-800 rounded border border-neutral-200 dark:border-neutral-700 shadow-sm overflow-hidden flex flex-col">
                <div class="px-4 py-3 border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 shrink-0">
                    <h3 class="font-semibold text-sm text-neutral-800 dark:text-neutral-200">
                        Subscriptions
                    </h3>
                </div>

                {/* Search Box */}
                <div class="px-2 py-2 border-b border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 shrink-0">
                    <div class="relative">
                        <SearchIcon class="absolute left-2.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-neutral-500 dark:text-neutral-400" />
                        <input
                            type="text"
                            placeholder="Filter subscriptions..."
                            value={subSearch()}
                            onInput={(e) => setSubSearch(e.currentTarget.value)}
                            class="w-full pl-9 pr-3 py-1.5 text-xs border border-neutral-300 dark:border-neutral-600 rounded-sm focus:border-brand-600 focus:ring-1 focus:ring-brand-600 outline-none bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 placeholder-neutral-600 dark:placeholder-neutral-400"
                        />
                    </div>
                </div>

                <div class="max-h-[300px] overflow-y-auto p-1 scrollbar-thin">
                    <Switch
                        fallback={
                            <div class="flex flex-col">
                                <For each={filteredSubs()}>
                                    {(sub) => (
                                        <button
                                            onClick={() => props.onSelectSub(sub)}
                                            class={`relative w-full text-left px-4 py-2.5 text-sm transition-colors ${
                                                props.selectedSub?.id === sub.id
                                                    ? 'bg-brand-50 dark:bg-brand-900/20 text-neutral-900 dark:text-white'
                                                    : 'text-neutral-800 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700'
                                            }`}
                                        >
                                            <Show when={props.selectedSub?.id === sub.id}>
                                                <div class="absolute left-0 top-0 bottom-0 w-[3px] bg-brand-600" />
                                            </Show>
                                            <div class="font-medium truncate">{sub.displayName}</div>
                                            <div class="text-xs text-neutral-600 dark:text-neutral-400 truncate font-mono mt-0.5">
                                                {sub.subscriptionId}
                                            </div>
                                        </button>
                                    )}
                                </For>
                            </div>
                        }
                    >
                        <Match when={props.isLoading && !props.selectedSub}>
                            <div class="flex justify-center p-4">
                                <LoaderIcon class="animate-spin w-5 h-5 text-brand-600" />
                            </div>
                        </Match>
                        <Match when={filteredSubs().length === 0}>
                            <div class="p-4 text-xs text-neutral-600 dark:text-neutral-400 text-center">
                                No subscriptions found.
                            </div>
                        </Match>
                    </Switch>
                </div>
            </div>

            {/* Vault Card */}
            <Show when={props.selectedSub}>
                <div class="bg-white dark:bg-neutral-800 rounded border border-neutral-200 dark:border-neutral-700 shadow-sm overflow-hidden fade-in-up flex flex-col">
                    <div class="px-4 py-3 border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 shrink-0">
                        <h3 class="font-semibold text-sm text-neutral-800 dark:text-neutral-200">
                            Key Vaults
                        </h3>
                    </div>

                    {/* Search Box */}
                    <div class="px-2 py-2 border-b border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 shrink-0">
                        <div class="relative">
                            <SearchIcon class="absolute left-2.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-neutral-500 dark:text-neutral-400" />
                            <input
                                type="text"
                                placeholder="Filter key vaults..."
                                value={vaultSearch()}
                                onInput={(e) => setVaultSearch(e.currentTarget.value)}
                                class="w-full pl-9 pr-3 py-1.5 text-xs border border-neutral-300 dark:border-neutral-600 rounded-sm focus:border-brand-600 focus:ring-1 focus:ring-brand-600 outline-none bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 placeholder-neutral-600 dark:placeholder-neutral-400"
                            />
                        </div>
                    </div>

                    <div class="max-h-[400px] overflow-y-auto p-1 scrollbar-thin">
                        <Switch
                            fallback={
                                <div class="flex flex-col">
                                    <For each={filteredVaults()}>
                                        {(kv) => (
                                            <button
                                                onClick={() => props.onSelectVault(kv)}
                                                class={`relative w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center gap-3 ${
                                                    props.selectedVault?.id === kv.id
                                                        ? 'bg-brand-50 dark:bg-brand-900/20 text-neutral-900 dark:text-white'
                                                        : 'text-neutral-800 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700'
                                                }`}
                                            >
                                                <Show when={props.selectedVault?.id === kv.id}>
                                                    <div class="absolute left-0 top-0 bottom-0 w-[3px] bg-brand-600" />
                                                </Show>
                                                <KeyVaultIcon
                                                    class={`w-4 h-4 flex-shrink-0 ${
                                                        props.selectedVault?.id === kv.id
                                                            ? 'text-brand-600'
                                                            : 'text-neutral-500 dark:text-neutral-400'
                                                    }`}
                                                />
                                                <div class="flex-1 min-w-0">
                                                    <div class="font-medium truncate">{kv.name}</div>
                                                    <div class="text-xs text-neutral-600 dark:text-neutral-400 truncate mt-0.5">
                                                        {kv.location} • {kv.sku}
                                                    </div>
                                                </div>
                                            </button>
                                        )}
                                    </For>
                                </div>
                            }
                        >
                            <Match when={props.isLoading}>
                                <div class="flex justify-center p-4">
                                    <LoaderIcon class="animate-spin w-5 h-5 text-brand-600" />
                                </div>
                            </Match>
                            <Match when={filteredVaults().length === 0}>
                                <p class="text-sm text-neutral-600 dark:text-neutral-400 p-4 text-center">
                                    No Key Vaults found.
                                </p>
                            </Match>
                        </Switch>
                    </div>
                </div>
            </Show>
        </div>
    );
};
