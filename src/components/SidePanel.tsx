import React, { useState } from 'react';
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

export const SidePanel: React.FC<SidePanelProps> = ({
    subscriptions,
    selectedSub,
    onSelectSub,
    vaults,
    selectedVault,
    onSelectVault,
    isLoading
}) => {
    const [subSearch, setSubSearch] = useState('');
    const [vaultSearch, setVaultSearch] = useState('');

    const filteredSubs = subscriptions.filter(s =>
        s.displayName.toLowerCase().includes(subSearch.toLowerCase()) ||
        s.subscriptionId.toLowerCase().includes(subSearch.toLowerCase())
    );

    const filteredVaults = vaults.filter(v =>
        v.name.toLowerCase().includes(vaultSearch.toLowerCase())
    );

    return (
        <div className="lg:col-span-3 flex flex-col gap-4">

            {/* Subscription Card */}
            <div className="bg-white dark:bg-neutral-800 rounded border border-neutral-200 dark:border-neutral-700 shadow-sm overflow-hidden flex flex-col">
                <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 shrink-0">
                    <h3 className="font-semibold text-sm text-neutral-800 dark:text-neutral-200">Subscriptions</h3>
                </div>

                {/* Search Box */}
                <div className="px-2 py-2 border-b border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 shrink-0">
                    <div className="relative">
                        <SearchIcon className="absolute left-2.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-neutral-500 dark:text-neutral-400" />
                        <input
                            type="text"
                            placeholder="Filter subscriptions..."
                            value={subSearch}
                            onChange={(e) => setSubSearch(e.target.value)}
                            className="w-full pl-9 pr-3 py-1.5 text-xs border border-neutral-300 dark:border-neutral-600 rounded-sm focus:border-brand-600 focus:ring-1 focus:ring-brand-600 outline-none bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 placeholder-neutral-600 dark:placeholder-neutral-400"
                        />
                    </div>
                </div>

                <div className="max-h-[300px] overflow-y-auto p-1 scrollbar-thin">
                    {isLoading && !selectedSub ? (
                        <div className="flex justify-center p-4"><LoaderIcon className="animate-spin w-5 h-5 text-brand-600" /></div>
                    ) : filteredSubs.length === 0 ? (
                        <div className="p-4 text-xs text-neutral-600 dark:text-neutral-400 text-center">No subscriptions found.</div>
                    ) : (
                        <div className="flex flex-col">
                            {filteredSubs.map(sub => (
                                <button
                                    key={sub.id}
                                    onClick={() => onSelectSub(sub)}
                                    className={`relative w-full text-left px-4 py-2.5 text-sm transition-colors ${selectedSub?.id === sub.id
                                        ? 'bg-brand-50 dark:bg-brand-900/20 text-neutral-900 dark:text-white'
                                        : 'text-neutral-800 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700'
                                        }`}
                                >
                                    {selectedSub?.id === sub.id && (
                                        <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-brand-600"></div>
                                    )}
                                    <div className="font-medium truncate">{sub.displayName}</div>
                                    <div className="text-xs text-neutral-600 dark:text-neutral-400 truncate font-mono mt-0.5">{sub.subscriptionId}</div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Vault Card */}
            {selectedSub && (
                <div className="bg-white dark:bg-neutral-800 rounded border border-neutral-200 dark:border-neutral-700 shadow-sm overflow-hidden fade-in-up flex flex-col">
                    <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 shrink-0">
                        <h3 className="font-semibold text-sm text-neutral-800 dark:text-neutral-200">Key Vaults</h3>
                    </div>

                    {/* Search Box */}
                    <div className="px-2 py-2 border-b border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 shrink-0">
                        <div className="relative">
                            <SearchIcon className="absolute left-2.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-neutral-500 dark:text-neutral-400" />
                            <input
                                type="text"
                                placeholder="Filter key vaults..."
                                value={vaultSearch}
                                onChange={(e) => setVaultSearch(e.target.value)}
                                className="w-full pl-9 pr-3 py-1.5 text-xs border border-neutral-300 dark:border-neutral-600 rounded-sm focus:border-brand-600 focus:ring-1 focus:ring-brand-600 outline-none bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 placeholder-neutral-600 dark:placeholder-neutral-400"
                            />
                        </div>
                    </div>

                    <div className="max-h-[400px] overflow-y-auto p-1 scrollbar-thin">
                        {isLoading ? (
                            <div className="flex justify-center p-4"><LoaderIcon className="animate-spin w-5 h-5 text-brand-600" /></div>
                        ) : filteredVaults.length === 0 ? (
                            <p className="text-sm text-neutral-600 dark:text-neutral-400 p-4 text-center">No Key Vaults found.</p>
                        ) : (
                            <div className="flex flex-col">
                                {filteredVaults.map(kv => (
                                    <button
                                        key={kv.id}
                                        onClick={() => onSelectVault(kv)}
                                        className={`relative w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center gap-3 ${selectedVault?.id === kv.id
                                            ? 'bg-brand-50 dark:bg-brand-900/20 text-neutral-900 dark:text-white'
                                            : 'text-neutral-800 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700'
                                            }`}
                                    >
                                        {selectedVault?.id === kv.id && (
                                            <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-brand-600"></div>
                                        )}
                                        <KeyVaultIcon className={`w-4 h-4 flex-shrink-0 ${selectedVault?.id === kv.id ? 'text-brand-600' : 'text-neutral-500 dark:text-neutral-400'}`} />
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium truncate">{kv.name}</div>
                                            <div className="text-xs text-neutral-600 dark:text-neutral-400 truncate mt-0.5">{kv.location} • {kv.sku}</div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
