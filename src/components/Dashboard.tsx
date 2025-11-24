import React, { useState, useEffect } from 'react';
import { Subscription, KeyVault, MigrationAnalysis, MigrationStatus, RoleDefinition, IdentityType, RoleAssignment } from '../types';
import { getSubscriptions, getKeyVaults, getRoleDefinitions, resolveBatchIdentities, getRoleAssignments } from '../services/azureService';
import { analyzePolicies, analyzeExistingCoverage } from '../services/analysisService';
import { ArrowRightIcon, LoaderIcon, ShieldCheckIcon, CheckCircleIcon, DownloadIcon } from './Icons';
import { SidePanel } from './SidePanel';
import { AnalysisResults } from './AnalysisResults';
import { exportToCSV, exportToJSON, exportToPowerShell, downloadFile } from '../utils/exportUtils';

interface DashboardProps {
  armToken: string;
  graphToken?: string;
  theme: 'light' | 'dark';
}

export const Dashboard: React.FC<DashboardProps> = ({ armToken, graphToken, theme }) => {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [selectedSub, setSelectedSub] = useState<Subscription | null>(null);

  const [vaults, setVaults] = useState<KeyVault[]>([]);
  const [selectedVault, setSelectedVault] = useState<KeyVault | null>(null);

  const [availableRoles, setAvailableRoles] = useState<RoleDefinition[]>([]);
  const [roleAssignments, setRoleAssignments] = useState<RoleAssignment[]>([]);
  const [status, setStatus] = useState<MigrationStatus>(MigrationStatus.LOADING);
  const [results, setResults] = useState<MigrationAnalysis[]>([]);

  // Selection state for multiple recommendations. Default to index 2 (Balanced) usually, but here 0
  const [selectedRoles, setSelectedRoles] = useState<Record<string, number>>({});
  // Stores Resolved Identity Info: { ID: { name: 'Alice', type: 'User' } }
  const [resolvedNames, setResolvedNames] = useState<Record<string, { name: string, type: IdentityType }>>({});
  const [showExportMenu, setShowExportMenu] = useState(false);

  useEffect(() => {
    const loadSubs = async () => {
      try {
        const subs = await getSubscriptions(armToken);
        setSubscriptions(subs);
        setStatus(MigrationStatus.IDLE);
      } catch (e) {
        console.error(e);
        setStatus(MigrationStatus.ERROR);
      }
    };
    loadSubs();
  }, [armToken]);

  useEffect(() => {
    if (selectedSub) {
      setStatus(MigrationStatus.LOADING);

      // Fetch Vaults, Roles, AND Assignments in parallel
      Promise.all([
        getKeyVaults(armToken, selectedSub.subscriptionId),
        getRoleDefinitions(armToken, selectedSub.subscriptionId),
        getRoleAssignments(armToken, selectedSub.subscriptionId)
      ])
        .then(([v, r, a]) => {
          setVaults(v);
          setAvailableRoles(r);
          setRoleAssignments(a);
          setStatus(MigrationStatus.IDLE);
        })
        .catch(e => {
          console.error(e);
          setStatus(MigrationStatus.ERROR);
        });

      setSelectedVault(null);
      setResults([]);
      setSelectedRoles({});
      setResolvedNames({});
    }
  }, [selectedSub, armToken]);

  // Trigger Identity Resolution when results are generated
  useEffect(() => {
    if (results.length > 0) {
      const objectIds = results.map(r => r.originalPolicy.objectId);
      resolveBatchIdentities(objectIds, graphToken || armToken).then(map => {
        setResolvedNames(prev => ({ ...prev, ...map }));
      });
    }
  }, [results, graphToken, armToken]);

  const handleExport = (format: 'csv' | 'json' | 'powershell') => {
    if (!selectedVault || !selectedSub) return;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const vaultName = selectedVault.name;

    switch (format) {
      case 'csv':
        const csv = exportToCSV(results, selectedRoles, resolvedNames);
        downloadFile(csv, `${vaultName}-migration-${timestamp}.csv`, 'text/csv');
        break;
      case 'json':
        const json = exportToJSON(results, selectedRoles, resolvedNames);
        downloadFile(json, `${vaultName}-migration-${timestamp}.json`, 'application/json');
        break;
      case 'powershell':
        const ps = exportToPowerShell(results, selectedRoles, resolvedNames, vaultName, selectedSub.subscriptionId);
        downloadFile(ps, `${vaultName}-migration-${timestamp}.ps1`, 'text/plain');
        break;
    }
    setShowExportMenu(false);
  };

  const handleAnalyze = async () => {
    if (!selectedVault) return;
    setStatus(MigrationStatus.ANALYZING);

    try {
      // Use local greedy analysis
      // Small timeout to allow UI to render the spinner
      setTimeout(() => {
        const analysis = analyzePolicies(selectedVault.accessPolicies, availableRoles);

        // Enhance with existing coverage check
        const enhancedAnalysis = analysis.map(a => {
          const coverage = analyzeExistingCoverage(a.originalPolicy, roleAssignments, availableRoles);
          return { ...a, existingCoverage: coverage };
        });

        setResults(enhancedAnalysis);
        const defaults: Record<string, number> = {};

        enhancedAnalysis.forEach(a => {
          // Find the strategy with the best confidence score
          let bestIndex = 0;
          let bestConfidence = a.recommendations[0]?.confidence || 0;

          for (let i = 1; i < a.recommendations.length; i++) {
            const currentConfidence = a.recommendations[i].confidence;

            if (currentConfidence > bestConfidence) {
              // Better confidence, use this one
              bestIndex = i;
              bestConfidence = currentConfidence;
            } else if (currentConfidence === bestConfidence) {
              // Tie - use priority: Minimize Excess (1) > Balanced (2) > Max Coverage (0)
              const currentStrategy = a.recommendations[i].strategy;
              const bestStrategy = a.recommendations[bestIndex].strategy;

              const priorityMap: Record<string, number> = {
                'Minimize Excess': 3,
                'Balanced': 2,
                'Max Coverage': 1
              };

              if ((priorityMap[currentStrategy] || 0) > (priorityMap[bestStrategy] || 0)) {
                bestIndex = i;
              }
            }
          }

          defaults[a.originalPolicy.objectId] = bestIndex;
        });
        setSelectedRoles(defaults);
        setStatus(MigrationStatus.COMPLETE);
      }, 500);
    } catch (err) {
      console.error(err);
      setStatus(MigrationStatus.ERROR);
    }
  };

  return (
    <div className="max-w-[1600px] mx-auto p-6">
      {/* Breadcrumb Style Header */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-400 mb-6">
        <button
          onClick={() => {
            setSelectedSub(null);
            setSelectedVault(null);
            setResults([]);
          }}
          onKeyPress={(e) => e.key === 'Enter' && setSelectedSub(null)}
          className="hover:underline cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-600 rounded px-1"
          aria-label="Go to home"
        >
          Home
        </button>
        <span aria-hidden="true">/</span>
        <button
          onClick={() => {
            setSelectedVault(null);
            setResults([]);
          }}
          onKeyPress={(e) => e.key === 'Enter' && setSelectedVault(null)}
          className={`hover:underline cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-600 rounded px-1 ${selectedSub ? 'text-neutral-900 dark:text-white font-semibold' : ''}`}
          aria-label="Go to subscriptions list"
        >
          Subscriptions
        </button>
        {selectedSub && (
          <>
            <span aria-hidden="true">/</span>
            <button
              onClick={() => {
                setSelectedVault(null);
                setResults([]);
              }}
              onKeyPress={(e) => e.key === 'Enter' && setSelectedVault(null)}
              className={`hover:underline cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-600 rounded px-1 ${selectedVault ? 'text-neutral-900 dark:text-white font-semibold' : ''}`}
              aria-label={`Go to ${selectedSub.displayName} vaults list`}
            >
              {selectedSub.displayName}
            </button>
          </>
        )}
        {selectedVault && (
          <>
            <span aria-hidden="true">/</span>
            <span className="text-neutral-900 dark:text-white font-semibold" aria-current="page">{selectedVault.name}</span>
          </>
        )}
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Selection Tree */}
        <SidePanel
          subscriptions={subscriptions}
          selectedSub={selectedSub}
          onSelectSub={setSelectedSub}
          vaults={vaults}
          selectedVault={selectedVault}
          onSelectVault={(v) => {
            setSelectedVault(v);
            setStatus(MigrationStatus.IDLE);
            setResults([]);
          }}
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
              {status === MigrationStatus.COMPLETE && (
                <div className="relative">
                  <button
                    onClick={() => setShowExportMenu(!showExportMenu)}
                    className="px-4 py-1.5 rounded text-sm font-medium bg-neutral-600 hover:bg-neutral-700 text-white flex items-center gap-2 transition-colors"
                    aria-label="Export results"
                  >
                    <DownloadIcon className="w-4 h-4" /> Export
                  </button>
                  {showExportMenu && (
                    <div className="absolute right-0 top-full mt-1 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded shadow-lg z-10 min-w-[160px]">
                      <button
                        onClick={() => handleExport('csv')}
                        className="w-full px-4 py-2 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
                      >
                        Export as CSV
                      </button>
                      <button
                        onClick={() => handleExport('json')}
                        className="w-full px-4 py-2 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
                      >
                        Export as JSON
                      </button>
                      <button
                        onClick={() => handleExport('powershell')}
                        className="w-full px-4 py-2 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
                      >
                        Export as PowerShell
                      </button>
                    </div>
                  )}
                </div>
              )}
              {selectedVault && (
                <button
                  onClick={handleAnalyze}
                  disabled={status === MigrationStatus.ANALYZING || status === MigrationStatus.COMPLETE}
                  className={`px-4 py-1.5 rounded text-sm font-medium transition-colors flex items-center gap-2 ${status === MigrationStatus.COMPLETE
                    ? 'bg-green-600 text-white cursor-default'
                    : 'bg-brand-600 hover:bg-brand-700 text-white shadow-sm'
                    }`}
                >
                  {status === MigrationStatus.ANALYZING ? (
                    <>
                      <LoaderIcon className="animate-spin w-4 h-4" /> Processing...
                    </>
                  ) : status === MigrationStatus.COMPLETE ? (
                    <>
                      <CheckCircleIcon className="w-4 h-4" /> Analysis Complete
                    </>
                  ) : (
                    <>
                      Run Analysis <ArrowRightIcon className="w-4 h-4" />
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          <div className="p-6 flex-1">
            {status === MigrationStatus.IDLE && !selectedVault && (
              <div className="h-full flex flex-col items-center justify-center text-neutral-500 dark:text-neutral-400">
                <div className="bg-neutral-100 dark:bg-neutral-700/50 p-6 rounded-full mb-4">
                  <ShieldCheckIcon className="w-12 h-12 text-neutral-400 dark:text-neutral-500" />
                </div>
                <p className="text-lg font-medium text-neutral-800 dark:text-neutral-300">No Vault Selected</p>
                <p className="text-sm text-neutral-700 dark:text-neutral-400">Please select a Subscription and Key Vault from the left panel.</p>
              </div>
            )}

            {status === MigrationStatus.IDLE && selectedVault && (
              <div className="h-full flex flex-col items-center justify-center">
                <div className="w-full max-w-2xl text-center">
                  <h3 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 mb-2">Ready to Analyze</h3>
                  <p className="text-neutral-700 dark:text-neutral-400 mb-4">This vault has <strong className="text-neutral-900 dark:text-white">{selectedVault.accessPolicies.length}</strong> legacy access policies defined.</p>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-8">We have loaded <strong className="text-neutral-900 dark:text-neutral-200">{availableRoles.length}</strong> RBAC roles (Built-in & Custom) from your subscription to find the best match.</p>

                  <div className="grid grid-cols-2 gap-4 mb-8">
                    <div className="p-4 bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-700 rounded">
                      <div className="text-2xl font-light text-brand-600">{selectedVault.accessPolicies.length}</div>
                      <div className="text-xs font-semibold uppercase text-neutral-700 dark:text-neutral-400 tracking-wide mt-1">Total Policies</div>
                    </div>
                    <div className="p-4 bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-700 rounded">
                      <div className="text-2xl font-light text-neutral-800 dark:text-neutral-200">
                        {availableRoles.length}
                      </div>
                      <div className="text-xs font-semibold uppercase text-neutral-700 dark:text-neutral-400 tracking-wide mt-1">Available Roles</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {status === MigrationStatus.ANALYZING && (
              <div className="h-full flex flex-col items-center justify-center">
                <div className="relative w-20 h-20 mb-8">
                  <div className="absolute inset-0 border-4 border-neutral-200 dark:border-neutral-700 rounded-full"></div>
                  <div className="absolute inset-0 border-4 border-brand-600 rounded-full border-t-transparent animate-spin"></div>
                </div>
                <p className="text-lg font-medium text-neutral-900 dark:text-neutral-200">Mapping Roles...</p>
                <p className="text-sm text-neutral-700 dark:text-neutral-400 mt-2 max-w-md text-center">Applying 3 weighted algorithmic strategies to determine optimal RBAC mappings.</p>
              </div>
            )}

            {status === MigrationStatus.COMPLETE && (
              <AnalysisResults
                results={results}
                selectedRoles={selectedRoles}
                setSelectedRoles={setSelectedRoles}
                resolvedNames={resolvedNames}
                theme={theme}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

