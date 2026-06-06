import React, { useState, useEffect, useRef } from 'react';
import { MigrationStatus, KeyVault, RoleDefinition } from '../types';
import { useAzureData, useAnalysis, useExport, ExportFormat } from '../hooks';
import { ArrowRightIcon, LoaderIcon, ShieldCheckIcon, CheckCircleIcon, DownloadIcon } from './Icons';
import { SidePanel } from './SidePanel';
import { AnalysisResults } from './AnalysisResults';
import { getPolicyKey } from '../utils/policyKey';

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

  // Use custom hooks for data and analysis management
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
    subscriptionId: selectedSub?.subscriptionId || '',
    vaultResourceId: selectedVault?.id || '',
  });

  // Resolve identities when results change
  useEffect(() => {
    if (results.length > 0 && !offlineData) {
      const idsToResolve: string[] = [];
      results.forEach((r) => {
        idsToResolve.push(r.originalPolicy.objectId);
        if (r.originalPolicy.applicationId?.trim()) {
          idsToResolve.push(r.originalPolicy.applicationId);
        }
      });
      resolveIdentities(idsToResolve);
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
      const resolvedType = resolvedNames[r.originalPolicy.objectId]?.type;
      const type = resolvedType || r.originalPolicy.type || 'Unknown';
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

  const handleAnalyze = async () => {
    if (!selectedVault) return;
    setStatus(MigrationStatus.ANALYZING);

    try {
      await runAnalysis();
      setStatus(MigrationStatus.COMPLETE);
    } catch (err) {
      console.error(err);
      setStatus(MigrationStatus.ERROR);
    }
  };

  const handleSelectVault = (vault: KeyVault) => {
    setSelectedVault(vault);
    setStatus(MigrationStatus.IDLE);
    clearResults();
  };

  const resetToSubscriptions = () => {
    setSelectedSub(null);
    setSelectedVault(null);
    clearResults();
  };

  const resetToVaults = () => {
    setSelectedVault(null);
    clearResults();
  };

  const builtInRoleCount = availableRoles.filter(
    (r) => r.properties.type === 'BuiltInRole'
  ).length;
  const customRoleCount = availableRoles.filter(
    (r) => r.properties.type === 'CustomRole'
  ).length;

  return (
    <div className="max-w-[1600px] mx-auto p-6">
      {/* Breadcrumb Navigation */}
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400 mb-6"
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
              className={`hover:underline cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-600 rounded px-1 ${selectedVault ? 'text-neutral-900 dark:text-white font-semibold' : ''
                }`}
            >
              {selectedSub.displayName}
            </button>
          </>
        )}
        {selectedVault && (
          <>
            <span aria-hidden="true">/</span>
            <span className="text-neutral-900 dark:text-white font-semibold" aria-current="page">
              {selectedVault.name}
            </span>
          </>
        )}
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Selection Panel */}
        <SidePanel
          subscriptions={subscriptions}
          selectedSub={selectedSub}
          onSelectSub={setSelectedSub}
          vaults={vaults}
          selectedVault={selectedVault}
          onSelectVault={handleSelectVault}
          isLoading={status === MigrationStatus.LOADING}
        />

        {/* Right Column: Workspace */}
        <div className="lg:col-span-9 bg-white dark:bg-neutral-800 rounded border border-neutral-200 dark:border-neutral-700 shadow-sm min-h-[600px] flex flex-col">
          {/* Workspace Header */}
          <div className="px-6 py-4 border-b border-neutral-200 dark:border-neutral-700 flex justify-between items-center bg-neutral-50/30">
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              {selectedVault ? `Analysis: ${selectedVault.name}` : 'Migration Workspace'}
            </h2>
            <div className="flex items-center gap-2">
              {/* Export Menu */}
              {status === MigrationStatus.COMPLETE && (
                <div className="relative">
                  <button
                    onClick={() => setShowExportMenu(!showExportMenu)}
                    className="px-4 py-1.5 rounded text-sm font-medium bg-neutral-600 hover:bg-neutral-700 text-white flex items-center gap-2 transition-colors"
                  >
                    <DownloadIcon className="w-4 h-4" /> Export
                  </button>
                  {showExportMenu && (
                    <div className="absolute right-0 top-full mt-1 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded shadow-lg z-10 min-w-[160px]">
                      {(['csv', 'json', 'powershell'] as ExportFormat[]).map((format) => (
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
                <div className="flex items-center gap-4">
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
                          status === MigrationStatus.COMPLETE
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
                      status === MigrationStatus.COMPLETE
                    }
                    className={`px-4 py-1.5 rounded text-sm font-medium transition-colors flex items-center gap-2 ${status === MigrationStatus.COMPLETE
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
          <div className="p-6 flex-1">
            {/* Empty State - No Vault Selected */}
            {status === MigrationStatus.IDLE && !selectedVault && (
              <div className="h-full flex flex-col items-center justify-center text-neutral-500 dark:text-neutral-400">
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

                  <div className="grid grid-cols-3 gap-4 mb-8">
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
                  Applying 3 weighted algorithmic strategies to determine optimal RBAC mappings.
                </p>
              </div>
            )}

            {/* Complete State - Show Results */}
            {status === MigrationStatus.COMPLETE && (
              <AnalysisResults
                results={results}
                selectedRoles={selectedRoles}
                setSelectedRoles={setSelectedRoles}
                resolvedNames={resolvedNames}
                theme={theme}
                selectedForExport={selectedForExport}
                setSelectedForExport={setSelectedForExport}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
