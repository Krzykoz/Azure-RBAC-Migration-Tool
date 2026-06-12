/**
 * Formats a raw Azure RBAC data-action string into a short, readable badge label.
 *
 * Shared between the on-screen permission visualizer and the standalone HTML
 * export so both render permission badges with identical labels.
 */
export const formatPermissionLabel = (p: string): string => {
  if (!p) return '';

  // Handle pure wildcard scenarios often seen in excess permissions
  if (p === '*' || p.endsWith('/*') || p === 'Microsoft.KeyVault/vaults/*') {
    return 'Full Access (*)';
  }

  // Remove the common prefix
  let label = p.replace(/Microsoft\.KeyVault\/vaults\//i, '');

  // Remove action suffix (e.g. /action) and annotate verb suffixes to keep it clean
  label = label.replace(/\/action$/i, '');
  label = label.replace(/\/read$/i, ' (read)');
  label = label.replace(/\/write$/i, ' (write)');
  label = label.replace(/\/delete$/i, ' (delete)');

  // Fallback if the replace didn't change much (e.g. custom provider actions), try to simplify
  if (label.length > 40) {
    const parts = label.split('/');
    return parts.length > 1 ? parts.slice(-2).join('/') : label;
  }

  return label;
};
