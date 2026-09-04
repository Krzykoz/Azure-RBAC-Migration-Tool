import React from 'react';
import { Subscription } from '../../core/types';
import { LoaderIcon } from '../icons';
import { CopyableCommand } from '../primitives/CopyableCommand';
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

export const RoleSourceSelector: React.FC<RoleSourceSelectorProps> = ({
  roleSource,
  onSelectSource,
  sourceStatus,
  pasteJson,
  onChangePasteJson,
  pasteError,
  token,
  onChangeToken,
  subscriptions,
  selectedSubId,
  onSelectSubscription,
  loadingSubs,
  loadingRoles,
  tokenError,
  onLoadSubscriptions,
  onLoadRoles,
}) => {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <h3 className="text-sm font-bold text-neutral-800 dark:text-neutral-200">
          Role source
        </h3>
        <span className="text-xs text-neutral-400">{sourceStatus}</span>
      </div>

      <div className="flex w-full flex-wrap gap-1 p-1 rounded-lg bg-neutral-100 dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-700 sm:inline-flex sm:w-auto">
        {SOURCE_OPTIONS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={roleSource === value}
            onClick={() => onSelectSource(value)}
            className={`min-w-0 flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors sm:flex-none sm:whitespace-nowrap ${
              roleSource === value
                ? 'bg-white dark:bg-neutral-700 text-brand-600 dark:text-white shadow-sm'
                : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {roleSource === 'paste' && (
        <div className="mt-3 max-w-2xl">
          <textarea
            aria-label="Role definitions JSON"
            value={pasteJson}
            onChange={(e) => onChangePasteJson(e.target.value)}
            placeholder="Paste Role Definitions JSON (az role definition list output)..."
            className="w-full h-32 p-3 font-mono text-xs rounded-sm bg-neutral-50 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 focus:border-brand-600 focus:ring-1 focus:ring-brand-600 outline-none resize-y"
          />
          {pasteError && (
            <p className="text-xs text-red-600 font-medium mt-1">{pasteError}</p>
          )}
        </div>
      )}

      {roleSource === 'token' && (
        <div className="mt-3 max-w-2xl space-y-2">
          <CopyableCommand command={TOKEN_COMMAND} commandId="manual-token" />
          <textarea
            aria-label="Management token"
            spellCheck={false}
            value={token}
            onChange={(e) => onChangeToken(e.target.value)}
            placeholder="Paste Management token..."
            className="w-full h-20 p-3 font-mono text-xs rounded-sm bg-neutral-50 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 focus:border-brand-600 focus:ring-1 focus:ring-brand-600 outline-none resize-none"
          />
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={onLoadSubscriptions}
              disabled={loadingSubs}
              className="px-3 py-1.5 rounded text-xs font-medium bg-neutral-600 hover:bg-neutral-700 text-white flex items-center gap-2 disabled:opacity-50"
            >
              {loadingSubs && <LoaderIcon className="animate-spin w-3.5 h-3.5" />}
              Load subscriptions
            </button>
            {subscriptions.length > 0 && (
              <>
                <select
                  aria-label="Subscription"
                  value={selectedSubId}
                  onChange={(e) => onSelectSubscription(e.target.value)}
                  className="flex-1 min-w-[140px] text-xs p-2 rounded bg-neutral-50 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 outline-none"
                >
                  {subscriptions.map((s) => (
                    <option key={s.subscriptionId} value={s.subscriptionId}>
                      {s.displayName}
                    </option>
                  ))}
                </select>
                <button
                  onClick={onLoadRoles}
                  disabled={loadingRoles}
                  className="px-3 py-1.5 rounded text-xs font-medium bg-brand-600 hover:bg-brand-700 text-white flex items-center gap-2 disabled:opacity-50"
                >
                  {loadingRoles && (
                    <LoaderIcon className="animate-spin w-3.5 h-3.5" />
                  )}
                  Load roles
                </button>
              </>
            )}
          </div>
          {tokenError && (
            <p className="text-xs text-red-600 font-medium">{tokenError}</p>
          )}
        </div>
      )}
    </div>
  );
};
