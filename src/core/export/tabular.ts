import { MigrationAnalysis, IdentityType } from '../types';
import { getPolicyKey } from '../identity/policyKey';
import {
  describeIdentity,
  displayIdentityType,
  isCompoundIdentity,
  resolveIdentityType,
} from '../identity/identity';

// Escape a value for safe inclusion in a CSV cell.
// - Doubles embedded quotes (RFC 4180) so names containing `"` don't corrupt the row.
// - Neutralizes spreadsheet formula injection by prefixing values that begin with =, +, -, @, tab or CR.
const csvCell = (value: string | number): string => {
  let s = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(s)) {
    s = `'${s}`;
  }
  return `"${s.replace(/"/g, '""')}"`;
};

// Escape a value for a PowerShell double-quoted string literal.
// Backtick is the PS escape char, and `"` / `$` are special inside double quotes; newlines are flattened.
const psEscape = (value: string | number): string =>
  String(value ?? '')
    .replace(/`/g, '``')
    .replace(/"/g, '`"')
    .replace(/\$/g, '`$')
    .replace(/[\r\n]+/g, ' ');

// Flatten a value for use in a single-line PowerShell comment.
const psComment = (value: string | number): string =>
  String(value ?? '').replace(/[\r\n]+/g, ' ');

export const exportToCSV = (
  results: MigrationAnalysis[],
  selectedRoles: Record<string, number>,
  resolvedNames: Record<string, { name: string; type: IdentityType }>
): string => {
  const headers = ['Identity Name', 'Object ID', 'Type', 'Strategy', 'Recommended Role', 'Confidence', 'Missing Permissions', 'Excess Permissions'];

  const rows = results.map((r) => {
    const selectedIdx = selectedRoles[getPolicyKey(r.originalPolicy)] || 0;
    const rec = r.recommendations[selectedIdx];
    const { displayName } = describeIdentity(r.originalPolicy, resolvedNames, { fallbackName: 'Unknown' });
    const type = displayIdentityType(r.originalPolicy, resolvedNames);

    return [
      displayName ?? 'Unknown',
      r.originalPolicy.objectId,
      type,
      rec.strategy,
      rec.roleName,
      `${rec.confidence}%`,
      rec.missingPermissions.length.toString(),
      rec.excessPermissions.length.toString(),
    ];
  });

  return [
    headers.join(','),
    ...rows.map((row) => row.map(csvCell).join(',')),
  ].join('\n');
};

export const exportToJSON = (
  results: MigrationAnalysis[],
  selectedRoles: Record<string, number>,
  resolvedNames: Record<string, { name: string; type: IdentityType }>
): string => {
  const exportData = results.map((r) => {
    const selectedIdx = selectedRoles[getPolicyKey(r.originalPolicy)] || 0;
    const rec = r.recommendations[selectedIdx];
    const { displayName, appName } = describeIdentity(r.originalPolicy, resolvedNames, { fallbackName: 'Unknown' });

    return {
      identity: {
        objectId: r.originalPolicy.objectId,
        name: displayName ?? 'Unknown',
        type: displayIdentityType(r.originalPolicy, resolvedNames),
        applicationId: r.originalPolicy.applicationId,
        applicationName: appName,
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
        roleBreakdown: rec.roleBreakdown,
      },
    };
  });

  return JSON.stringify(exportData, null, 2);
};

export const exportToPowerShell = (
  results: MigrationAnalysis[],
  selectedRoles: Record<string, number>,
  resolvedNames: Record<string, { name: string; type: IdentityType }>,
  vaultName: string,
  subscriptionId: string,
  vaultResourceId?: string
): string => {
  const script = [`# Azure Key Vault RBAC Migration Script
# Generated: ${new Date().toISOString()}
# Vault: ${psComment(vaultName)}
# Subscription: ${psComment(subscriptionId)}

# WARNING: Review this script carefully before running!
# This script will create role assignments for the Key Vault.

$vaultName = "${psEscape(vaultName)}"
$subscriptionId = "${psEscape(subscriptionId)}"
$scope = "${psEscape(vaultResourceId || '')}"

# Get the Key Vault resource
$vault = Get-AzKeyVault -VaultName $vaultName
if (-not $scope) { $scope = $vault.ResourceId }

Write-Host "Starting RBAC migration for Key Vault: $vaultName" -ForegroundColor Green
Write-Host ""

`];

  // Categorize results by identity type
  const categorized: Record<string, MigrationAnalysis[]> = {
    'Applications & Service Principals': [],
    'Compound Identities': [],
    'Groups': [],
    'Users': [],
    'Unknown Identities': [],
  };

  results.forEach((r) => {
    const type = resolveIdentityType(r.originalPolicy, resolvedNames);

    // Compound identities have both objectId and applicationId
    if (isCompoundIdentity(r.originalPolicy)) {
      categorized['Compound Identities'].push(r);
    } else if (type === 'Application' || type === 'ServicePrincipal') {
      categorized['Applications & Service Principals'].push(r);
    } else if (type === 'Group') {
      categorized['Groups'].push(r);
    } else if (type === 'User') {
      categorized['Users'].push(r);
    } else {
      categorized['Unknown Identities'].push(r);
    }
  });

  const generateIdentityScript = (r: MigrationAnalysis) => {
    const selectedIdx = selectedRoles[getPolicyKey(r.originalPolicy)] || 0;
    const rec = r.recommendations[selectedIdx];
    const { displayName } = describeIdentity(r.originalPolicy, resolvedNames, { fallbackName: 'Unknown' });

    script.push(`# ${psComment(displayName ?? 'Unknown')} (${psComment(r.originalPolicy.objectId)})`);
    script.push(`# Strategy: ${psComment(rec.strategy)} | Confidence: ${rec.confidence}%`);

    if (rec.roleNames && rec.roleNames.length > 0) {
      rec.roleNames.forEach((roleName) => {
        script.push(`New-AzRoleAssignment \``);
        script.push(`  -ObjectId "${psEscape(r.originalPolicy.objectId)}" \``);
        script.push(`  -RoleDefinitionName "${psEscape(roleName)}" \``);
        script.push(`  -Scope $scope`);
      });
    } else {
      script.push(`# No matching role found for this identity`);
    }

    if (rec.missingPermissions.length > 0) {
      script.push(`# WARNING: ${rec.missingPermissions.length} permissions will NOT be covered:`);
      rec.missingPermissions.forEach((perm) => {
        script.push(`#   - ${psComment(perm)}`);
      });
    }

    if (rec.excessPermissions.length > 0) {
      script.push(`# NOTE: Additional permissions that will be granted:`);
      // Build a map of permission -> roles that add it
      const permissionToRoles: Record<string, string[]> = {};
      if (rec.roleBreakdown && rec.roleBreakdown.length > 0) {
        rec.roleBreakdown.forEach((rb) => {
          rb.excess.forEach((perm) => {
            if (!permissionToRoles[perm]) {
              permissionToRoles[perm] = [];
            }
            permissionToRoles[perm].push(rb.roleName);
          });
        });
      }

      rec.excessPermissions.forEach((perm) => {
        const roles = permissionToRoles[perm];
        if (roles && roles.length > 0) {
          script.push(`#   - ${psComment(perm)} (added by: ${psComment(roles.join(', '))})`);
        } else {
          script.push(`#   - ${psComment(perm)}`);
        }
      });
    }

    script.push('');
  };

  Object.entries(categorized).forEach(([category, items]) => {
    if (items.length > 0) {
      script.push(`${'#'.repeat(80)}`);
      script.push(`# ${category} (${items.length})`);
      script.push(`${'#'.repeat(80)}`);
      script.push('');

      items.forEach(generateIdentityScript);
    }
  });

  script.push(`Write-Host "Migration script completed" -ForegroundColor Green`);

  return script.join('\n');
};
