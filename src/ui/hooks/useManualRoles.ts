import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  const tokenRef = useRef('');
  const selectedSubRef = useRef('');
  const subscriptionRequest = useRef(0);
  const roleRequest = useRef(0);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      subscriptionRequest.current++;
      roleRequest.current++;
    };
  }, []);

  const setToken = useCallback((value: string) => {
    if (value === tokenRef.current) return;
    tokenRef.current = value;
    subscriptionRequest.current++;
    roleRequest.current++;
    selectedSubRef.current = '';
    setTokenState(value);
    setSubscriptions([]);
    setSelectedSubId('');
    setTokenRoles([]);
    setTokenError(null);
    setLoadingSubs(false);
    setLoadingRoles(false);
  }, []);

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
    } catch (e: any) {
      setPastedRoles([]);
      setPasteError(e?.message || 'Invalid JSON.');
    }
  }, [pasteJson, roleSource]);

  const selectSubscription = (id: string) => {
    subscriptionRequest.current++;
    roleRequest.current++;
    selectedSubRef.current = id;
    setSelectedSubId(id);
    setTokenRoles([]);
    setTokenError(null);
    setLoadingSubs(false);
    setLoadingRoles(false);
  };

  const loadSubscriptions = async () => {
    const request = ++subscriptionRequest.current;
    roleRequest.current++;
    const requestedToken = tokenRef.current.trim();
    const isCurrent = () => mounted.current && request === subscriptionRequest.current &&
      requestedToken === tokenRef.current.trim();
    selectedSubRef.current = '';
    setTokenError(null);
    setSubscriptions([]);
    setSelectedSubId('');
    setTokenRoles([]);
    setLoadingSubs(false);
    setLoadingRoles(false);

    if (!requestedToken) {
      setTokenError('Paste a Management token first.');
      return;
    }

    setLoadingSubs(true);
    try {
      await validateToken(requestedToken);
      if (!isCurrent()) return;
      const subs = await getSubscriptions(requestedToken);
      if (!isCurrent()) return;
      if (subs.length === 0) {
        setTokenError('Token is valid, but no subscriptions are visible to it.');
        return;
      }
      setSubscriptions(subs);
      selectedSubRef.current = subs[0].subscriptionId;
      setSelectedSubId(subs[0].subscriptionId);
    } catch (e: unknown) {
      if (!isCurrent()) return;
      setTokenError(e instanceof Error ? e.message : 'Failed to validate token.');
    } finally {
      if (isCurrent()) setLoadingSubs(false);
    }
  };

  const loadRoles = async () => {
    const request = ++roleRequest.current;
    const requestedToken = tokenRef.current.trim();
    const requestedSub = selectedSubRef.current;
    const isCurrent = () => mounted.current && request === roleRequest.current &&
      requestedToken === tokenRef.current.trim() && requestedSub === selectedSubRef.current;
    setTokenError(null);
    setTokenRoles([]);
    setLoadingRoles(false);
    if (!requestedToken) {
      setTokenError('Paste a Management token first.');
      return;
    }
    if (!requestedSub) {
      setTokenError('Select a subscription first.');
      return;
    }
    setLoadingRoles(true);
    try {
      const roles = await getRoleDefinitions(requestedToken, requestedSub);
      if (!isCurrent()) return;
      if (roles.length === 0) {
        setTokenError(
          'Connected, but no Key Vault roles were found in the selected subscription.'
        );
        return;
      }
      setTokenRoles(roles);
    } catch (e: unknown) {
      if (!isCurrent()) return;
      setTokenError(e instanceof Error ? e.message : 'Failed to load role definitions.');
    } finally {
      if (isCurrent()) setLoadingRoles(false);
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
