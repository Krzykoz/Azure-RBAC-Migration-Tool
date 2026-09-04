import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { MigrationStatus, KeyVault, RoleDefinition, Subscription } from '../../core/types';
import { useAzureData } from '../hooks/useAzureData';
import { useAnalysis } from '../hooks/useAnalysis';
import { useExport, ExportFormat } from '../hooks/useExport';
import { ArrowRightIcon, LoaderIcon, ShieldCheckIcon, CheckCircleIcon, DownloadIcon } from '../icons';
import { SidePanel } from '../components/SidePanel';
import { getPolicyKey } from '../../core/identity/policyKey';
import { isCompoundIdentity, resolveIdentityType } from '../../core/identity/identity';

// Lazily loaded so the heavy charting library (recharts) is only fetched once an
// analysis completes, keeping the initial bundle small.
const AnalysisResults = lazy(() =>
  import('../components/AnalysisResults').then((m) => ({ default: m.AnalysisResults }))
);

interface DashboardProps {
  armToken: string;
  graphToken?: string;
  theme: 'light' | 'dark';
  offlineData?: { vaults: KeyVault[]; roles: RoleDefinition[] } | null;
}

export const Dashboard: React.FC<DashboardProps> = ({
  armToken,
  graphToken,
  theme,
  offlineData,
}) => {
  const [includeCustomRoles, setIncludeCustomRoles] = useState(true);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const {
    subscriptions,
    selectedSub,
    setSelectedSub,
    vaults,
    selectedVault,
    setSelectedVault,
    availableRoles,
    roleAssignments,
    resolvedNames,
    status,
    error: azureError,
    setStatus,
    resolveIdentities,
  } = useAzureData({ armToken, graphToken, offlineData });

  const {
    results,
    selectedRoles,
    setSelectedRoles,
    selectedForExport,
    setSelectedForExport,
    runAnalysis,
    clearResults,
  } = useAnalysis({
    selectedVault,
    availableRoles,
    roleAssignments,
    resolvedNames,
    includeCustomRoles,
  });

  const { showExportMenu, setShowExportMenu, handleExport } = useExport({
    results,
    selectedRoles,
    resolvedNames,
    selectedForExport,
    vaultName: selectedVault?.name || '',
    subscriptionId: selectedVault?.id.match(/^\/subscriptions\/([^/]+)\//i)?.[1] || selectedSub?.subscriptionId || '',
    vaultResourceId: selectedVault?.id || '',
    theme,
  });

  // Close the export dropdown when clicking outside of it.
  const exportMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showExportMenu) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (
        exportMenuRef.current &&
        event.target instanceof Node &&
        !exportMenuRef.current.contains(event.target)
      ) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showExportMenu, setShowExportMenu]);

  // Resolve identities when results change
  useEffect(() => {
    if (results.length > 0 && !offlineData) {
      const idsToResolve: string[] = [];
      const applicationIds: string[] = [];
      results.forEach((r) => {
        idsToResolve.push(r.originalPolicy.objectId);
        if (isCompoundIdentity(r.originalPolicy)) {
          applicationIds.push(r.originalPolicy.applicationId!);
        }
      });
      resolveIdentities(idsToResolve, applicationIds);
    }
  }, [results, offlineData, resolveIdentities]);

  // Update export selection when resolved names change
  const autoAddedExportKeys = useRef<Set<string>>(new Set());

  // Reset auto-add tracking whenever a new analysis run produces fresh results.
  useEffect(() => {
    autoAddedExportKeys.current = new Set();
  }, [results]);

  // When identity names/types resolve, auto-include identities that transition from Unknown to a
  // known type — but only once each, so the user's manual export de-selections are preserved.
  useEffect(() => {
    if (results.length === 0) return;

    const newlyKnown: string[] = [];
    results.forEach((r) => {
      const key = getPolicyKey(r.originalPolicy);
      const type = resolveIdentityType(r.originalPolicy, resolvedNames);
      if (type !== 'Unknown' && !autoAddedExportKeys.current.has(key)) {
        newlyKnown.push(key);
      }
    });

    if (newlyKnown.length === 0) return;

    newlyKnown.forEach((key) => autoAddedExportKeys.current.add(key));
    setSelectedForExport((prev) => {
      const next = new Set(prev);
      newlyKnown.forEach((key) => next.add(key));
      return next;
    });
  }, [resolvedNames, results, setSelectedForExport]);

  const handleAnalyze = () => {
    if (!selectedVault) return;
    setAnalysisError(null);
    setStatus(MigrationStatus.ANALYZING);

    try {
      runAnalysis();
      setStatus(MigrationStatus.COMPLETE);
    } catch (err) {
      console.error(err);
      setAnalysisError(err instanceof Error ? err.message : 'Analysis failed.');
      setStatus(MigrationStatus.ERROR);
    }
  };

  const handleSelectVault = (vault: KeyVault) => {
    setSelectedVault(vault);
    setAnalysisError(null);
    setShowExportMenu(false);
    setStatus(MigrationStatus.IDLE);
    clearResults();
  };

  const handleSelectSubscription = (sub: Subscription | null) => {
    if (sub === selectedSub) return;
    setSelectedSub(sub);
    setSelectedVault(null);
    setAnalysisError(null);
    setShowExportMenu(false);
    setStatus(sub ? MigrationStatus.LOADING : MigrationStatus.IDLE);
    clearResults();
  };

  const resetToSubscriptions = () => handleSelectSubscription(null);

  const resetToVaults = () => {
    setSelectedVault(null);
    setAnalysisError(null);
    setShowExportMenu(false);
    if (status !== MigrationStatus.LOADING) setStatus(MigrationStatus.IDLE);
    clearResults();
  };

  const builtInRoleCount = availableRoles.filter(
    (r) => r.properties.type === 'BuiltInRole'
  ).length;
  const customRoleCount = availableRoles.filter(
    (r) => r.properties.type === 'CustomRole'
  ).length;

  return (
    <div className="max-w-[1600px] mx-auto p-3 sm:p-4 lg:p-6">
      {/* Breadcrumb Navigation */}
      <nav
        aria-label="Breadcrumb"
        className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-600 dark:text-neutral-400 mb-4 sm:mb-6"
      >
        <button
          onClick={resetToSubscriptions}
          className="hover:underline cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-600 rounded px-1"
        >
          Home
        </button>
        <span aria-hidden="true">/</span>
        <button
          onClick={resetToVaults}
          className={`hover:underline cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-600 rounded px-1 ${selectedSub ? 'text-neutral-900 dark:text-white font-semibold' : ''
            }`}
        >
          Subscriptions
        </button>
        {selectedSub && (
          <>
            <span aria-hidden="true">/</span>
            <button
              onClick={resetToVaults}
              className={`max-w-full min-w-0 truncate hover:underline cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-600 rounded px-1 ${selectedVault ? 'text-neutral-900 dark:text-white font-semibold' : ''
                }`}
            >
              {selectedSub.displayName}
            </button>
          </>
        )}
        {selectedVault && (
          <>
            <span aria-hidden="true">/</span>
            <span className="min-w-0 max-w-full break-all text-neutral-900 dark:text-white font-semibold" aria-current="page">
              {selectedVault.name}
            </span>
          </>
        )}
      </nav>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 sm:gap-6 items-start">
        {/* Left Column: Selection Panel */}
        <SidePanel
          subscriptions={subscriptions}
          selectedSub={selectedSub}
          onSelectSub={handleSelectSubscription}
          vaults={vaults}
          selectedVault={selectedVault}
          onSelectVault={handleSelectVault}
          isLoading={status === MigrationStatus.LOADING}
        />

        {/* Right Column: Workspace */}
        <div className="xl:col-span-9 min-w-0 bg-white dark:bg-neutral-800 rounded border border-neutral-200 dark:border-neutral-700 shadow-sm min-h-[420px] sm:min-h-[600px] flex flex-col">
          {/* Workspace Header */}
          <div className="px-4 py-4 sm:px-6 border-b border-neutral-200 dark:border-neutral-700 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-between sm:items-center bg-neutral-50 dark:bg-neutral-800/50">
            <h2 className="min-w-0 break-words text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              {selectedVault ? `Analysis: ${selectedVault.name}` : 'Migration Workspace'}
            </h2>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
              {/* Export Menu */}
              {status === MigrationStatus.COMPLETE && (
                <div className="relative w-full sm:w-auto" ref={exportMenuRef}>
                  <button
                    onClick={() => setShowExportMenu(!showExportMenu)}
                    aria-expanded={showExportMenu}
                    className="w-full px-4 py-1.5 rounded text-sm font-medium bg-neutral-600 hover:bg-neutral-700 text-white flex items-center justify-center gap-2 transition-colors sm:w-auto"
                  >
                    <DownloadIcon className="w-4 h-4" /> Export
                  </button>
                  {showExportMenu && (
                    <div className="absolute right-0 top-full mt-1 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded shadow-lg z-10 min-w-[160px]">
                      {(['csv', 'json', 'powershell', 'html'] as ExportFormat[]).map((format) => (
                        <button
                          key={format}
                          onClick={() => handleExport(format)}
                          className="w-full px-4 py-2 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
                        >
                          Export as {format.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Analysis Controls */}
              {selectedVault && (
                <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center sm:gap-4">
                  {/* Custom Role Toggle */}
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <div className="relative">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={includeCustomRoles}
                        onChange={(e) => setIncludeCustomRoles(e.target.checked)}
                        disabled={
                          status === MigrationStatus.ANALYZING ||
                          status === MigrationStatus.COMPLETE ||
                          status === MigrationStatus.LOADING ||
                          !!azureError
                        }
                      />
                      <div className="w-9 h-5 bg-neutral-300 dark:bg-neutral-600 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-600"></div>
                    </div>
                    <span
                      className={`text-sm font-medium ${status === MigrationStatus.ANALYZING ||
                          status === MigrationStatus.COMPLETE
                          ? 'text-neutral-400'
                          : 'text-neutral-700 dark:text-neutral-300'
                        }`}
                    >
                      Include Custom Roles
                    </span>
                  </label>

                  {/* Analyze Button */}
                  <button
                    onClick={handleAnalyze}
                    disabled={
                      status === MigrationStatus.ANALYZING ||
                      status === MigrationStatus.COMPLETE ||
                      status === MigrationStatus.LOADING ||
                      !!azureError
                    }
                    className={`w-full justify-center px-4 py-1.5 rounded text-sm font-medium transition-colors flex items-center gap-2 sm:w-auto ${status === MigrationStatus.COMPLETE
                        ? 'bg-green-600 text-white cursor-default'
                        : 'bg-brand-600 hover:bg-brand-700 text-white shadow-sm'
                      }`}
                  >
                    {status === MigrationStatus.ANALYZING && (
                      <>
                        <LoaderIcon className="animate-spin w-4 h-4" /> Processing...
                      </>
                    )}
                    {status === MigrationStatus.COMPLETE && (
                      <>
                        <CheckCircleIcon className="w-4 h-4" /> Analysis Complete
                      </>
                    )}
                    {status !== MigrationStatus.ANALYZING &&
                      status !== MigrationStatus.COMPLETE && (
                        <>
                          Run Analysis <ArrowRightIcon className="w-4 h-4" />
                        </>
                      )}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Workspace Content */}
          <div className="min-w-0 p-4 sm:p-6 flex-1">
            {status === MigrationStatus.ERROR && (
              <div role="alert" className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-900/20 dark:text-red-300">
                <p className="font-semibold">{analysisError || azureError || 'Unable to complete the operation.'}</p>
                <p className="mt-2">Select another subscription or vault, or sign out and reconnect with a fresh token.</p>
              </div>
            )}
            {/* Empty State - No Vault Selected */}
            {status === MigrationStatus.IDLE && !selectedVault && (
              <div className="h-full flex flex-col items-center justify-center text-center text-neutral-500 dark:text-neutral-400">
                <div className="bg-neutral-100 dark:bg-neutral-700/50 p-6 rounded-full mb-4">
                  <ShieldCheckIcon className="w-12 h-12 text-neutral-400 dark:text-neutral-500" />
                </div>
                <p className="text-lg font-medium text-neutral-800 dark:text-neutral-300">
                  No Vault Selected
                </p>
                <p className="text-sm text-neutral-700 dark:text-neutral-400">
                  Please select a Subscription and Key Vault from the left panel.
                </p>
              </div>
            )}

            {/* Ready State - Vault Selected */}
            {status === MigrationStatus.IDLE && selectedVault && (
              <div className="h-full flex flex-col items-center justify-center">
                <div className="w-full max-w-2xl text-center">
                  <h3 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
                    Ready to Analyze
                  </h3>
                  <p className="text-neutral-700 dark:text-neutral-400 mb-4">
                    This vault has{' '}
                    <strong className="text-neutral-900 dark:text-white">
                      {selectedVault.accessPolicies.length}
                    </strong>{' '}
                    legacy access policies defined.
                  </p>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-8">
                    We have loaded{' '}
                    <strong className="text-neutral-900 dark:text-neutral-200">
                      {availableRoles.length}
                    </strong>{' '}
                    RBAC roles (Built-in & Custom) from your subscription to find the best match.
                  </p>

                  <div className="grid grid-cols-1 gap-3 mb-8 sm:grid-cols-3 sm:gap-4">
                    <div className="p-4 bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-700 rounded">
                      <div className="text-2xl font-light text-brand-600">
                        {selectedVault.accessPolicies.length}
                      </div>
                      <div className="text-xs font-semibold uppercase text-neutral-700 dark:text-neutral-400 tracking-wide mt-1">
                        Total Policies
                      </div>
                    </div>
                    <div className="p-4 bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-700 rounded">
                      <div className="text-2xl font-light text-neutral-800 dark:text-neutral-200">
                        {builtInRoleCount}
                      </div>
                      <div className="text-xs font-semibold uppercase text-neutral-700 dark:text-neutral-400 tracking-wide mt-1">
                        Built-in Roles
                      </div>
                    </div>
                    <div className="p-4 bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-700 rounded">
                      <div className="text-2xl font-light text-neutral-800 dark:text-neutral-200">
                        {customRoleCount}
                      </div>
                      <div className="text-xs font-semibold uppercase text-neutral-700 dark:text-neutral-400 tracking-wide mt-1">
                        Custom Roles
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Analyzing State */}
            {status === MigrationStatus.ANALYZING && (
              <div className="h-full flex flex-col items-center justify-center">
                <div className="relative w-20 h-20 mb-8">
                  <div className="absolute inset-0 border-4 border-neutral-200 dark:border-neutral-700 rounded-full"></div>
                  <div className="absolute inset-0 border-4 border-brand-600 rounded-full border-t-transparent animate-spin"></div>
                </div>
                <p className="text-lg font-medium text-neutral-900 dark:text-neutral-200">
                  Mapping Roles...
                </p>
                <p className="text-sm text-neutral-700 dark:text-neutral-400 mt-2 max-w-md text-center">
                  Applying 3 weighted strategies to suggest RBAC mappings.
                </p>
              </div>
            )}

            {/* Complete State - Show Results */}
            {status === MigrationStatus.COMPLETE && (
              <Suspense
                fallback={
                  <div className="h-full flex flex-col items-center justify-center text-neutral-500 dark:text-neutral-400">
                    <LoaderIcon className="animate-spin w-6 h-6 text-brand-600 mb-3" />
                    <p className="text-sm">Loading results…</p>
                  </div>
                }
              >
                <AnalysisResults
                  results={results}
                  selectedRoles={selectedRoles}
                  setSelectedRoles={setSelectedRoles}
                  resolvedNames={resolvedNames}
                  theme={theme}
                  selectedForExport={selectedForExport}
                  setSelectedForExport={setSelectedForExport}
                />
              </Suspense>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
