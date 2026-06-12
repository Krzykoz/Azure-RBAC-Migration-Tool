import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import { MigrationAnalysis, IdentityType } from '../../core/types';
import { exportToCSV, exportToJSON, exportToPowerShell } from '../../core/export/tabular';
import { exportToHtml } from '../../core/export/html';
import { downloadFile } from '../../core/export/download';
import { getPolicyKey } from '../../core/identity/policyKey';

export type ExportFormat = 'csv' | 'json' | 'powershell' | 'html';

interface UseExportProps {
  results: MigrationAnalysis[];
  selectedRoles: Record<string, number>;
  resolvedNames: Record<string, { name: string; type: IdentityType }>;
  selectedForExport: Set<string>;
  vaultName: string;
  subscriptionId: string;
  vaultResourceId: string;
  theme: 'light' | 'dark';
}

interface UseExportResult {
  showExportMenu: boolean;
  setShowExportMenu: Dispatch<SetStateAction<boolean>>;
  handleExport: (format: ExportFormat) => boolean;
}

/** Generates and downloads the selected export format for the chosen identities. */
export const useExport = ({
  results,
  selectedRoles,
  resolvedNames,
  selectedForExport,
  vaultName,
  subscriptionId,
  vaultResourceId,
  theme,
}: UseExportProps): UseExportResult => {
  const [showExportMenu, setShowExportMenu] = useState(false);

  const handleExport = useCallback(
    (format: ExportFormat): boolean => {
      // Filter results by selection
      const filteredResults = results.filter((r) =>
        selectedForExport.has(getPolicyKey(r.originalPolicy))
      );

      if (filteredResults.length === 0) {
        alert('Please select at least one identity to export.');
        return false;
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);

      switch (format) {
        case 'csv': {
          const csv = exportToCSV(filteredResults, selectedRoles, resolvedNames);
          downloadFile(csv, `${vaultName}-migration-${timestamp}.csv`, 'text/csv');
          break;
        }
        case 'json': {
          const json = exportToJSON(filteredResults, selectedRoles, resolvedNames);
          downloadFile(json, `${vaultName}-migration-${timestamp}.json`, 'application/json');
          break;
        }
        case 'powershell': {
          const ps = exportToPowerShell(
            filteredResults,
            selectedRoles,
            resolvedNames,
            vaultName,
            subscriptionId,
            vaultResourceId
          );
          downloadFile(ps, `${vaultName}-migration-${timestamp}.ps1`, 'text/plain');
          break;
        }
        case 'html': {
          const html = exportToHtml(
            filteredResults,
            selectedRoles,
            resolvedNames,
            theme,
            vaultName,
            subscriptionId
          );
          downloadFile(html, `${vaultName}-analysis-${timestamp}.html`, 'text/html');
          break;
        }
      }

      setShowExportMenu(false);
      return true;
    },
    [
      results,
      selectedRoles,
      resolvedNames,
      selectedForExport,
      vaultName,
      subscriptionId,
      vaultResourceId,
      theme,
    ]
  );

  return {
    showExportMenu,
    setShowExportMenu,
    handleExport,
  };
};
