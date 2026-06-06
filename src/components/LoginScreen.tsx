import React, { useState } from 'react';
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

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onLogin,
  onOffline,
  onManual,
  theme,
  onToggleTheme,
}) => {
  const [armToken, setArmToken] = useState('');
  const [graphToken, setGraphToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!armToken) return;

    setLoading(true);
    setError('');

    try {
      await validateToken(armToken);
      onLogin(armToken, graphToken);
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
    <div className="min-h-screen flex items-center justify-center p-4 bg-neutral-100 dark:bg-neutral-900">
      <div className="relative max-w-[500px] w-full bg-white dark:bg-neutral-800 shadow-fluent p-8 rounded-lg border border-neutral-200 dark:border-neutral-700 my-8 max-h-[90vh] overflow-y-auto">
        <div className="flex flex-col items-start mb-6">
          <div className="flex items-center justify-between gap-4 mb-2 w-full">
            <span className="font-semibold text-lg text-neutral-800 dark:text-neutral-200">
              Migration Assistant
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={onManual}
                className="bg-neutral-700 hover:bg-neutral-800 text-white text-xs font-semibold py-1.5 px-3 rounded-sm transition-colors flex items-center gap-1.5 shadow-sm"
                aria-label="Use Manual Mode"
              >
                <ShieldCheckIcon className="w-3.5 h-3.5" />
                Manual Mode
              </button>
              <button
                onClick={onOffline}
                className="bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold py-1.5 px-3 rounded-sm transition-colors flex items-center gap-1.5 shadow-sm"
                aria-label="Use Offline Mode"
              >
                <WifiOffIcon className="w-3.5 h-3.5" />
                Offline Mode
              </button>
            </div>
          </div>
          <h2 className="text-2xl font-semibold text-neutral-900 dark:text-white mt-2">
            Connect to Azure
          </h2>
          <p className="text-neutral-600 dark:text-neutral-400 text-sm mt-1">
            This tool runs entirely in your browser. Tokens are not stored.
          </p>
        </div>

        <div className="space-y-6">
          {/* ARM Token Section */}
          <div>
            <label className="block text-sm font-bold text-neutral-800 dark:text-neutral-200 mb-1.5">
              1. Management Token <span className="text-red-500">*</span>
            </label>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
              Required for listing Subscriptions, Vaults, and Access Policies.
            </p>
            <CopyableCommand command={armCommand} commandId="arm" />
            <textarea
              value={armToken}
              onChange={(e) => setArmToken(e.target.value)}
              placeholder="Paste Management token..."
              className="w-full h-20 p-3 rounded-sm bg-white dark:bg-neutral-900 border border-neutral-400 hover:border-neutral-600 dark:border-neutral-600 dark:hover:border-neutral-400 focus:border-brand-600 focus:ring-1 focus:ring-brand-600 outline-none text-xs font-mono text-neutral-800 dark:text-neutral-200 resize-none transition-colors placeholder-neutral-500"
            />
          </div>

          {/* Graph Token Section */}
          <div>
            <label className="block text-sm font-bold text-neutral-800 dark:text-neutral-200 mb-1.5">
              2. Graph Token <span className="text-neutral-400 font-normal">(Optional)</span>
            </label>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
              Required to see <strong>Names</strong> instead of GUIDs.
            </p>
            <CopyableCommand command={graphCommand} commandId="graph" />
            <textarea
              value={graphToken}
              onChange={(e) => setGraphToken(e.target.value)}
              placeholder="Paste Graph token..."
              className="w-full h-20 p-3 rounded-sm bg-white dark:bg-neutral-900 border border-neutral-400 hover:border-neutral-600 dark:border-neutral-600 dark:hover:border-neutral-400 focus:border-brand-600 focus:ring-1 focus:ring-brand-600 outline-none text-xs font-mono text-neutral-800 dark:text-neutral-200 resize-none transition-colors placeholder-neutral-500"
            />
          </div>

          {error && (
            <p className="text-xs text-red-600 font-bold bg-red-50 dark:bg-red-900/20 p-2 rounded border border-red-100 dark:border-red-900">
              {error}
            </p>
          )}

          <div className="flex flex-col items-end gap-3 pt-2">
            <button
              onClick={handleLogin}
              disabled={loading || !armToken}
              className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold py-2 px-6 rounded-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {loading ? 'Verifying...' : 'Connect'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
