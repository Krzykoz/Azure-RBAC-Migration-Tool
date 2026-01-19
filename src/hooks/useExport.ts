import { useCallback, useState } from 'react';
import { MigrationAnalysis, IdentityType } from '../types';
import { exportToCSV, exportToJSON, exportToPowerShell, downloadFile } from '../utils/exportUtils';

export type ExportFormat = 'csv' | 'json' | 'powershell';

interface UseExportProps {
    results: MigrationAnalysis[];
    selectedRoles: Record<string, number>;
    resolvedNames: Record<string, { name: string; type: IdentityType }>;
    selectedForExport: Set<string>;
    vaultName: string;
    subscriptionId: string;
    vaultResourceId: string;
}

interface UseExportResult {
    showExportMenu: boolean;
    setShowExportMenu: (show: boolean) => void;
    handleExport: (format: ExportFormat) => boolean;
}

/**
 * Hook for handling export functionality
 */
export const useExport = ({
    results,
    selectedRoles,
    resolvedNames,
    selectedForExport,
    vaultName,
    subscriptionId,
    vaultResourceId,
}: UseExportProps): UseExportResult => {
    const [showExportMenu, setShowExportMenu] = useState(false);

    const handleExport = useCallback(
        (format: ExportFormat): boolean => {
            // Filter results by selection
            const filteredResults = results.filter((r) =>
                selectedForExport.has(r.originalPolicy.objectId)
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
        ]
    );

    return {
        showExportMenu,
        setShowExportMenu,
        handleExport,
    };
};
