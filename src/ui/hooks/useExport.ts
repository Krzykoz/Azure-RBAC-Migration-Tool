import { MigrationAnalysis, IdentityType } from '../../core/types';
import { exportToCSV, exportToJSON, exportToPowerShell, parseVaultResourceId } from '../../core/export/tabular';
import { downloadFile } from '../../core/export/download';
import { getPolicyKey } from '../../core/identity/policyKey';

export const EXPORT_FORMATS = ['csv', 'json', 'powershell', 'html'] as const;
type ExportFormat = (typeof EXPORT_FORMATS)[number];

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
  /** Why a format can't be exported right now, or null when it can. */
  exportBlocker: (format: ExportFormat) => string | null;
  handleExport: (format: ExportFormat) => Promise<void>;
}

/** The app's own compiled CSS, inlined into the HTML report. Cross-origin sheets are unreadable and skipped. */
const collectAppCss = (): string =>
  Array.from(document.styleSheets).flatMap((sheet) => {
    try {
      return Array.from(sheet.cssRules, (rule) => rule.cssText);
    } catch {
      return [];
    }
  }).join('\n');

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
  const selected = results.filter((r) => selectedForExport.has(getPolicyKey(r.originalPolicy)));

  const exportBlocker = (format: ExportFormat): string | null => {
    if (selected.length === 0) return 'Select at least one identity to export.';
    if (format === 'powershell') {
      try {
        parseVaultResourceId(vaultResourceId);
      } catch (error) {
        return error instanceof Error ? error.message : 'A valid target vault resource ID is required.';
      }
    }
    return null;
  };

  const handleExport = async (format: ExportFormat): Promise<void> => {
    if (exportBlocker(format)) return;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);

    switch (format) {
      case 'csv':
        downloadFile(exportToCSV(selected, selectedRoles, resolvedNames), `${vaultName}-migration-${timestamp}.csv`, 'text/csv');
        break;
      case 'json':
        downloadFile(exportToJSON(selected, selectedRoles, resolvedNames), `${vaultName}-migration-${timestamp}.json`, 'application/json');
        break;
      case 'powershell':
        downloadFile(
          exportToPowerShell(selected, selectedRoles, resolvedNames, vaultResourceId),
          `${vaultName}-migration-${timestamp}.ps1`,
          'text/plain'
        );
        break;
      case 'html': {
        // Loaded on demand: the report pulls in react-dom/server.
        const { exportToHtml } = await import('../export/report');
        const html = exportToHtml(selected, selectedRoles, resolvedNames, {
          theme,
          vaultName,
          subscriptionId,
          css: collectAppCss(),
        });
        downloadFile(html, `${vaultName}-analysis-${timestamp}.html`, 'text/html');
        break;
      }
    }
  };

  return { exportBlocker, handleExport };
};
