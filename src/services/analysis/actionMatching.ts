const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Does a role's data action satisfy a required action? Case-insensitive.
 *
 * - `*` or an exact match always matches.
 * - A trailing `/*` matches children (".../secrets/<x>") but NOT siblings that
 *   merely share the prefix (".../secretsBackup/<x>") — the slash is preserved.
 * - Any other embedded `*` is treated as a glob and matched via regex.
 */
export const actionMatches = (roleAction: string, requiredAction: string): boolean => {
  const r = roleAction.toLowerCase();
  const req = requiredAction.toLowerCase();

  if (r === '*' || r === req) return true;

  if (r.endsWith('/*')) {
    const prefix = r.slice(0, -1); // keep trailing slash
    return req.startsWith(prefix);
  }

  if (r.includes('*')) {
    const regex = new RegExp('^' + r.split('*').map(escapeRegExp).join('.*') + '$');
    return regex.test(req);
  }

  return false;
};
