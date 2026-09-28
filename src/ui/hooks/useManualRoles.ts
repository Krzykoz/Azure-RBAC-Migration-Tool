import { useEffect, useMemo, useRef, useState } from 'react';
import { RoleDefinition, Subscription } from '../../core/types';
import { getBuiltInKeyVaultRoles } from '../../core/roles/builtIn';
import { parseRolesJson } from '../../core/roles/normalization';
import { validateToken, getSubscriptions, getRoleDefinitions } from '../../azure/client';

export type RoleSource = 'builtin' | 'paste' | 'token';

interface UseManualRoles {
  roleSource: RoleSource;
  setRoleSource: (source: RoleSource) => void;
  activeRoles: RoleDefinition[];
  sourceStatus: string;

  // Paste source
  pasteJson: string;
  setPasteJson: (value: string) => void;
  pasteError: string | null;

  // Live token source
  token: string;
  setToken: (value: string) => void;
  subscriptions: Subscription[];
  selectedSubId: string;
  selectSubscription: (id: string) => void;
  loadingSubs: boolean;
  loadingRoles: boolean;
  tokenError: string | null;
  loadSubscriptions: () => Promise<void>;
  loadRoles: () => Promise<void>;
}

/**
 * Owns the "where do role definitions come from" state machine: built-in
 * (offline), pasted JSON (parsed live), or a live management token. Exposes the
 * resolved `activeRoles` for the chosen source plus a human-readable status.
 */
export const useManualRoles = (): UseManualRoles => {
  const [roleSource, setRoleSource] = useState<RoleSource>('builtin');

  // Paste source
  const [pasteJson, setPasteJson] = useState('');
  const [pastedRoles, setPastedRoles] = useState<RoleDefinition[]>([]);
  const [pasteError, setPasteError] = useState<string | null>(null);

  // Live token source
  const [token, setTokenState] = useState('');
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [selectedSubId, setSelectedSubId] = useState('');
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [tokenRoles, setTokenRoles] = useState<RoleDefinition[]>([]);
  const [tokenError, setTokenError] = useState<string | null>(null);
  // The in-flight load; superseded by any newer load or input change, and aborted on unmount.
  const request = useRef(new AbortController());

  useEffect(() => {
    request.current = new AbortController();
    return () => request.current.abort();
  }, []);

  /** Cancel whatever is loading and clear everything derived from the token and subscription. */
  const restart = (clearSubscriptions: boolean): AbortSignal => {
    request.current.abort();
    request.current = new AbortController();
    if (clearSubscriptions) {
      setSubscriptions([]);
      setSelectedSubId('');
    }
    setTokenRoles([]);
    setTokenError(null);
    setLoadingSubs(false);
    setLoadingRoles(false);
    return request.current.signal;
  };

  const setToken = (value: string) => {
    if (value === token) return;
    restart(true);
    setTokenState(value);
  };

  const builtInRoles = useMemo(() => getBuiltInKeyVaultRoles(), []);

  const activeRoles =
    roleSource === 'builtin' ? builtInRoles : roleSource === 'paste' ? pastedRoles : tokenRoles;

  // Parse pasted JSON live as the user types.
  useEffect(() => {
    if (roleSource !== 'paste') return;
    if (!pasteJson.trim()) {
      setPastedRoles([]);
      setPasteError(null);
      return;
    }
    try {
      setPastedRoles(parseRolesJson(pasteJson));
      setPasteError(null);
    } catch (e: unknown) {
      setPastedRoles([]);
      setPasteError(e instanceof Error ? e.message : 'Invalid JSON.');
    }
  }, [pasteJson, roleSource]);

  const selectSubscription = (id: string) => {
    restart(false);
    setSelectedSubId(id);
  };

  const loadSubscriptions = async () => {
    const signal = restart(true);
    const requestedToken = token.trim();
    if (!requestedToken) {
      setTokenError('Paste a Management token first.');
      return;
    }

    setLoadingSubs(true);
    try {
      await validateToken(requestedToken, signal);
      signal.throwIfAborted();
      const subs = await getSubscriptions(requestedToken, signal);
      signal.throwIfAborted();
      if (subs.length === 0) {
        setTokenError('Token is valid, but no subscriptions are visible to it.');
        return;
      }
      setSubscriptions(subs);
      setSelectedSubId(subs[0].subscriptionId);
    } catch (e: unknown) {
      if (!signal.aborted) setTokenError(e instanceof Error ? e.message : 'Failed to validate token.');
    } finally {
      if (!signal.aborted) setLoadingSubs(false);
    }
  };

  const loadRoles = async () => {
    const signal = restart(false);
    const requestedToken = token.trim();
    if (!requestedToken) {
      setTokenError('Paste a Management token first.');
      return;
    }
    if (!selectedSubId) {
      setTokenError('Select a subscription first.');
      return;
    }
    setLoadingRoles(true);
    try {
      const roles = await getRoleDefinitions(requestedToken, selectedSubId, signal);
      signal.throwIfAborted();
      if (roles.length === 0) {
        setTokenError(
          'Connected, but no Key Vault roles were found in the selected subscription.'
        );
        return;
      }
      setTokenRoles(roles);
    } catch (e: unknown) {
      if (!signal.aborted) setTokenError(e instanceof Error ? e.message : 'Failed to load role definitions.');
    } finally {
      if (!signal.aborted) setLoadingRoles(false);
    }
  };

  const sourceStatus = (() => {
    if (roleSource === 'builtin') return `${builtInRoles.length} built-in roles loaded`;
    if (roleSource === 'paste')
      return pastedRoles.length > 0 ? `${pastedRoles.length} roles parsed` : 'No roles parsed yet';
    return tokenRoles.length > 0 ? `${tokenRoles.length} roles loaded` : 'No roles loaded yet';
  })();

  return {
    roleSource,
    setRoleSource,
    activeRoles,
    sourceStatus,
    pasteJson,
    setPasteJson,
    pasteError,
    token,
    setToken,
    subscriptions,
    selectedSubId,
    selectSubscription,
    loadingSubs,
    loadingRoles,
    tokenError,
    loadSubscriptions,
    loadRoles,
  };
};
