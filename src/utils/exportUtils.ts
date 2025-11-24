import { MigrationAnalysis, IdentityType } from '../types';

/**
 * Generates a CSV export of the analysis results
 */
export const exportToCSV = (
    results: MigrationAnalysis[],
    selectedRoles: Record<string, number>,
    resolvedNames: Record<string, { name: string, type: IdentityType }>
): string => {
    const headers = ['Identity Name', 'Object ID', 'Type', 'Strategy', 'Recommended Role', 'Confidence', 'Missing Permissions', 'Excess Permissions'];

    const rows = results.map(r => {
        const selectedIdx = selectedRoles[r.originalPolicy.objectId] || 0;
        const rec = r.recommendations[selectedIdx];
        const resolvedInfo = resolvedNames[r.originalPolicy.objectId];
        const displayName = resolvedInfo?.name || r.originalPolicy.displayName || 'Unknown';
        const type = resolvedInfo?.type || r.originalPolicy.type || 'Unknown';

        return [
            displayName,
            r.originalPolicy.objectId,
            type,
            rec.strategy,
            rec.roleName,
            `${rec.confidence}%`,
            rec.missingPermissions.length.toString(),
            rec.excessPermissions.length.toString()
        ];
    });

    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    return csvContent;
};

/**
 * Generates a JSON export of the analysis results
 */
export const exportToJSON = (
    results: MigrationAnalysis[],
    selectedRoles: Record<string, number>,
    resolvedNames: Record<string, { name: string, type: IdentityType }>
): string => {
    const exportData = results.map(r => {
        const selectedIdx = selectedRoles[r.originalPolicy.objectId] || 0;
        const rec = r.recommendations[selectedIdx];
        const resolvedInfo = resolvedNames[r.originalPolicy.objectId];

        return {
            identity: {
                objectId: r.originalPolicy.objectId,
                name: resolvedInfo?.name || r.originalPolicy.displayName || 'Unknown',
                type: resolvedInfo?.type || r.originalPolicy.type || 'Unknown',
                applicationId: r.originalPolicy.applicationId
            },
            originalPermissions: r.originalPolicy.permissions,
            recommendation: {
                strategy: rec.strategy,
                roleName: rec.roleName,
                roleNames: rec.roleNames,
                confidence: rec.confidence,
                coveredPermissions: rec.coveredPermissions,
                missingPermissions: rec.missingPermissions,
                excessPermissions: rec.excessPermissions,
                roleBreakdown: rec.roleBreakdown
            }
        };
    });

    return JSON.stringify(exportData, null, 2);
};

/**
 * Generates a PowerShell script to apply the RBAC role assignments
 */
export const exportToPowerShell = (
    results: MigrationAnalysis[],
    selectedRoles: Record<string, number>,
    resolvedNames: Record<string, { name: string, type: IdentityType }>,
    vaultName: string,
    subscriptionId: string
): string => {
    const script = [`# Azure Key Vault RBAC Migration Script
# Generated: ${new Date().toISOString()}
# Vault: ${vaultName}
# Subscription: ${subscriptionId}

# WARNING: Review this script carefully before running!
# This script will create role assignments for the Key Vault.

$vaultName = "${vaultName}"
$subscriptionId = "${subscriptionId}"

# Get the Key Vault resource
$vault = Get-AzKeyVault -VaultName $vaultName

Write-Host "Starting RBAC migration for Key Vault: $vaultName" -ForegroundColor Green
Write-Host ""

`];

    results.forEach(r => {
        const selectedIdx = selectedRoles[r.originalPolicy.objectId] || 0;
        const rec = r.recommendations[selectedIdx];
        const resolvedInfo = resolvedNames[r.originalPolicy.objectId];
        const displayName = resolvedInfo?.name || r.originalPolicy.displayName || 'Unknown';

        script.push(`# ${displayName} (${r.originalPolicy.objectId})`);
        script.push(`# Strategy: ${rec.strategy} | Confidence: ${rec.confidence}%`);

        if (rec.roleNames && rec.roleNames.length > 0) {
            rec.roleNames.forEach(roleName => {
                script.push(`New-AzRoleAssignment \``);
                script.push(`  -ObjectId "${r.originalPolicy.objectId}" \``);
                script.push(`  -RoleDefinitionName "${roleName}" \``);
                script.push(`  -Scope $vault.ResourceId`);
            });
        } else {
            script.push(`# No matching role found for this identity`);
        }

        if (rec.missingPermissions.length > 0) {
            script.push(`# WARNING: ${rec.missingPermissions.length} permissions will NOT be covered`);
        }
        if (rec.excessPermissions.length > 0) {
            script.push(`# NOTE: ${rec.excessPermissions.length} additional permissions will be granted`);
        }

        script.push('');
    });

    script.push(`Write-Host "Migration script completed" -ForegroundColor Green`);

    return script.join('\n');
};

/**
 * Downloads a file with the given content
 */
export const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};
