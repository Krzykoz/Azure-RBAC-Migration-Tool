
import React, { useState } from 'react';
import { validateToken } from '../services/azureService';
import { SunIcon, MoonIcon, CopyIcon, CheckCircleIcon } from './Icons';

interface LoginScreenProps {
  onLogin: (armToken: string, graphToken: string) => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin, theme, onToggleTheme }) => {
  const [armToken, setArmToken] = useState('');
  const [graphToken, setGraphToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);

  const handleLogin = async () => {
    if (!armToken) return;

    setLoading(true);
    setError('');

    try {
      // Only validate the ARM token as it's critical for the app to work
      await validateToken(armToken);
      onLogin(armToken, graphToken);
    } catch (e: any) {
      // e is likely an AzureError, but we use any to access message safely
      setError(e.message || 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string, commandId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCommand(commandId);
      setTimeout(() => setCopiedCommand(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const armCommand = 'az account get-access-token --resource https://management.azure.com -o tsv --query accessToken';
  const graphCommand = 'az account get-access-token --resource https://graph.microsoft.com -o tsv --query accessToken';

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-neutral-100 dark:bg-neutral-900">

      <div className="relative max-w-[500px] w-full bg-white dark:bg-neutral-800 shadow-fluent p-8 rounded-lg border border-neutral-200 dark:border-neutral-700 my-8 max-h-[90vh] overflow-y-auto">
        <div className="flex flex-col items-start mb-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="font-semibold text-lg text-neutral-800 dark:text-neutral-200">Migration Assistant</span>
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
            <div
              onClick={() => copyToClipboard(armCommand, 'arm')}
              className="bg-neutral-100 dark:bg-neutral-900/50 p-2 rounded mb-2 border border-neutral-200 dark:border-neutral-700 cursor-pointer hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors group relative"
            >
              <code className="block font-mono text-[10px] text-brand-700 dark:text-brand-300 break-all select-all pr-8">
                {armCommand}
              </code>
              <div className="absolute top-1/2 right-2 transform -translate-y-1/2 flex items-center gap-1">
                {copiedCommand === 'arm' ? (
                  <CheckCircleIcon className="w-4 h-4 text-white dark:text-white animate-in fade-in zoom-in duration-200" />
                ) : (
                  <CopyIcon className="w-4 h-4 text-neutral-400 dark:text-neutral-500 group-hover:text-white dark:group-hover:text-white transition-all duration-200" />
                )}
              </div>
            </div>
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
            <div
              onClick={() => copyToClipboard(graphCommand, 'graph')}
              className="bg-neutral-100 dark:bg-neutral-900/50 p-2 rounded mb-2 border border-neutral-200 dark:border-neutral-700 cursor-pointer hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors group relative"
            >
              <code className="block font-mono text-[10px] text-brand-700 dark:text-brand-300 break-all select-all pr-8">
                {graphCommand}
              </code>
              <div className="absolute top-1/2 right-2 transform -translate-y-1/2 flex items-center gap-1">
                {copiedCommand === 'graph' ? (
                  <CheckCircleIcon className="w-4 h-4 text-white dark:text-white animate-in fade-in zoom-in duration-200" />
                ) : (
                  <CopyIcon className="w-4 h-4 text-neutral-400 dark:text-neutral-500 group-hover:text-white dark:group-hover:text-white transition-all duration-200" />
                )}
              </div>
            </div>
            <textarea
              value={graphToken}
              onChange={(e) => setGraphToken(e.target.value)}
              placeholder="Paste Graph token..."
              className="w-full h-20 p-3 rounded-sm bg-white dark:bg-neutral-900 border border-neutral-400 hover:border-neutral-600 dark:border-neutral-600 dark:hover:border-neutral-400 focus:border-brand-600 focus:ring-1 focus:ring-brand-600 outline-none text-xs font-mono text-neutral-800 dark:text-neutral-200 resize-none transition-colors placeholder-neutral-500"
            />
          </div>

          {error && <p className="text-xs text-red-600 font-bold bg-red-50 dark:bg-red-900/20 p-2 rounded border border-red-100 dark:border-red-900">{error}</p>}

          <div className="flex justify-end pt-2">
            <button
              onClick={handleLogin}
              disabled={loading || !armToken}
              className="bg-brand-600 hover:bg-brand-700 text-white font-semibold py-2 px-6 rounded-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {loading ? 'Verifying...' : 'Connect'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
