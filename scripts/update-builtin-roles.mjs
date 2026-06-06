#!/usr/bin/env node
/**
 * Regenerates src/assets/builtInKeyVaultRoles.json from live Azure metadata so
 * the bundled built-in roles stay in sync with Azure changes.
 *
 * Usage:
 *   az login                # once, if not already authenticated
 *   npm run update-roles
 *
 * It runs `az role definition list`, keeps only built-in roles that expose a
 * Key Vault data action, and writes them in the same shape the app already
 * parses. Requires the Azure CLI (`az`) to be installed and logged in.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = join(__dirname, '..', 'src', 'assets', 'builtInKeyVaultRoles.json');

const AZ_QUERY =
    "[?contains(to_string(permissions[].dataActions[]), 'Microsoft.KeyVault')]";

const isKeyVaultDataRole = (role) =>
    Array.isArray(role?.permissions) &&
    role.permissions.some(
        (p) =>
            Array.isArray(p?.dataActions) &&
            p.dataActions.some(
                (da) => typeof da === 'string' && da.toLowerCase().includes('microsoft.keyvault')
            )
    );

const main = () => {
    let raw;
    try {
        raw = execFileSync(
            'az',
            ['role', 'definition', 'list', '--custom-role-only', 'false', '--query', AZ_QUERY, '--output', 'json'],
            { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
        );
    } catch (e) {
        console.error('Failed to run `az role definition list`.');
        console.error('Ensure the Azure CLI is installed and you have run `az login`.');
        console.error(String(e.stderr || e.message || e));
        process.exit(1);
    }

    let roles;
    try {
        roles = JSON.parse(raw);
    } catch (e) {
        console.error('Azure CLI did not return valid JSON.', e);
        process.exit(1);
    }

    // Keep built-in roles with a Key Vault data action; strip volatile fields az adds.
    const value = roles
        .filter((r) => (r.roleType || r.type) && isKeyVaultDataRole(r))
        .filter((r) => (r.roleType ? r.roleType === 'BuiltInRole' : true))
        .map((r) => ({
            assignableScopes: r.assignableScopes ?? ['/'],
            description: r.description ?? r.roleName ?? '',
            id: r.id,
            name: r.name,
            permissions: (r.permissions ?? []).map((p) => ({
                actions: p.actions ?? [],
                notActions: p.notActions ?? [],
                dataActions: p.dataActions ?? [],
                notDataActions: p.notDataActions ?? [],
            })),
            roleName: r.roleName,
            roleType: r.roleType ?? 'BuiltInRole',
            type: r.type ?? 'Microsoft.Authorization/roleDefinitions',
        }))
        .sort((a, b) => a.roleName.localeCompare(b.roleName));

    if (value.length === 0) {
        console.error('No Key Vault built-in roles found. Aborting (not overwriting the bundled file).');
        process.exit(1);
    }

    const output = {
        _comment:
            'Canonical Azure Key Vault data-plane built-in RBAC roles. This is DATA, not code: refresh it with `npm run update-roles`. Source: `az role definition list`.',
        _source: `az role definition list --query "${AZ_QUERY}" -o json`,
        _generated: new Date().toISOString().slice(0, 10),
        value,
    };

    writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n', 'utf8');
    console.log(`Wrote ${value.length} Key Vault built-in roles to ${OUTPUT_PATH}`);
};

main();
