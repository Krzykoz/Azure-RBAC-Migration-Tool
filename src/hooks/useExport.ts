import { createSignal, type Accessor, type Setter } from 'solid-js';
import { MigrationAnalysis, IdentityType } from '../types';
import { exportToCSV, exportToJSON, exportToPowerShell, downloadFile } from '../utils/exportUtils';
import { exportToHtml } from '../utils/htmlExport';
import { getPolicyKey } from '../utils/policyKey';

export type ExportFormat = 'csv' | 'json' | 'powershell' | 'html';

interface UseExportProps {
    results: Accessor<MigrationAnalysis[]>;
    selectedRoles: Accessor<Record<string, number>>;
    resolvedNames: Accessor<Record<string, { name: string; type: IdentityType }>>;
    selectedForExport: Accessor<Set<string>>;
    vaultName: Accessor<string>;
    subscriptionId: Accessor<string>;
    vaultResourceId: Accessor<string>;
    theme: Accessor<'light' | 'dark'>;
}

export interface UseExport {
    showExportMenu: Accessor<boolean>;
    setShowExportMenu: Setter<boolean>;
    handleExport: (format: ExportFormat) => boolean;
}

/**
 * Builds and downloads the selected export format from the current results,
 * honoring the per-identity export selection.
 */
export const useExport = (props: UseExportProps): UseExport => {
    const [showExportMenu, setShowExportMenu] = createSignal(false);

    const handleExport = (format: ExportFormat): boolean => {
        // Filter results by selection
        const filteredResults = props.results().filter((r) =>
            props.selectedForExport().has(getPolicyKey(r.originalPolicy))
        );

        if (filteredResults.length === 0) {
            alert('Please select at least one identity to export.');
            return false;
        }

        const selectedRoles = props.selectedRoles();
        const resolvedNames = props.resolvedNames();
        const vaultName = props.vaultName();
        const subscriptionId = props.subscriptionId();
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
                    props.vaultResourceId()
                );
                downloadFile(ps, `${vaultName}-migration-${timestamp}.ps1`, 'text/plain');
                break;
            }
            case 'html': {
                const html = exportToHtml(
                    filteredResults,
                    selectedRoles,
                    resolvedNames,
                    props.theme(),
                    vaultName,
                    subscriptionId
                );
                downloadFile(html, `${vaultName}-analysis-${timestamp}.html`, 'text/html');
                break;
            }
        }

        setShowExportMenu(false);
        return true;
    };

    return {
        showExportMenu,
        setShowExportMenu,
        handleExport,
    };
};
