import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Subscription,
  KeyVault,
  RoleDefinition,
  RoleAssignment,
  IdentityType,
  MigrationStatus,
} from '../../core/types';
import {
  getSubscriptions,
  getKeyVaults,
  getRoleDefinitions,
  getRoleAssignments,
  resolveBatchIdentities,
} from '../../azure/client';

interface UseAzureDataProps {
  armToken: string;
  graphToken?: string;
  offlineData?: { vaults: KeyVault[]; roles: RoleDefinition[] } | null;
}

interface UseAzureDataResult {
  subscriptions: Subscription[];
  selectedSub: Subscription | null;
  setSelectedSub: (sub: Subscription | null) => void;
  vaults: KeyVault[];
  selectedVault: KeyVault | null;
  setSelectedVault: (vault: KeyVault | null) => void;
  availableRoles: RoleDefinition[];
  roleAssignments: RoleAssignment[];
  resolvedNames: Record<string, { name: string; type: IdentityType }>;
  status: MigrationStatus;
  error: string | null;
  setStatus: (status: MigrationStatus) => void;
  resolveIdentities: (objectIds: string[], applicationIds?: string[]) => Promise<void>;
}

/**
 * Owns the Azure data-fetching state: subscriptions → vaults/roles/assignments →
 * resolved identity names. In offline mode the pasted data is substituted and no
 * network calls are made.
 */
export const useAzureData = ({
  armToken,
  graphToken,
  offlineData,
}: UseAzureDataProps): UseAzureDataResult => {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [selectedSub, setSelectedSubState] = useState<Subscription | null>(null);
  const [vaults, setVaults] = useState<KeyVault[]>([]);
  const [selectedVault, setSelectedVault] = useState<KeyVault | null>(null);
  const [availableRoles, setAvailableRoles] = useState<RoleDefinition[]>([]);
  const [roleAssignments, setRoleAssignments] = useState<RoleAssignment[]>([]);
  const [resolvedNames, setResolvedNames] = useState<
    Record<string, { name: string; type: IdentityType }>
  >({});
  const [status, setStatus] = useState<MigrationStatus>(MigrationStatus.LOADING);
  const [error, setError] = useState<string | null>(null);
  // Re-selecting the current subscription must not reset data its load effect won't refetch.
  const selectedSubRef = useRef<Subscription | null>(null);
  // Graph lookups in flight; aborted once their names would belong to another subscription or token.
  const identityRequests = useRef(new AbortController());

  const resetIdentities = useCallback(() => {
    identityRequests.current.abort();
    identityRequests.current = new AbortController();
    setResolvedNames({});
  }, []);

  const setSelectedSub = useCallback((sub: Subscription | null) => {
    if (sub && selectedSubRef.current === sub) return;
    selectedSubRef.current = sub;
    setSelectedSubState(sub);
    setVaults([]);
    setAvailableRoles([]);
    setRoleAssignments([]);
    setSelectedVault(null);
    setError(null);
    setStatus(sub ? MigrationStatus.LOADING : MigrationStatus.IDLE);
    resetIdentities();
  }, [resetIdentities]);

  useEffect(() => {
    identityRequests.current = new AbortController();
    return () => identityRequests.current.abort();
  }, []);

  useEffect(resetIdentities, [graphToken, resetIdentities]);

  // Load subscriptions
  useEffect(() => {
    const controller = new AbortController();
    setSelectedSub(null);
    setSubscriptions([]);
    setStatus(MigrationStatus.LOADING);

    if (offlineData) {
      setSubscriptions([
        {
          id: '/subscriptions/offline-sub',
          displayName: 'Offline Subscription',
          subscriptionId: 'offline-sub',
        },
      ]);
      setStatus(MigrationStatus.IDLE);
      return;
    }

    if (!armToken.trim()) {
      setError('A Management token is required to load subscriptions.');
      setStatus(MigrationStatus.ERROR);
      return;
    }

    getSubscriptions(armToken, controller.signal)
      .then((subs) => {
        if (controller.signal.aborted) return;
        setSubscriptions(subs);
        setStatus(MigrationStatus.IDLE);
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        console.error('Failed to load subscriptions:', e);
        setError(e instanceof Error ? e.message : 'Failed to load subscriptions.');
        setStatus(MigrationStatus.ERROR);
      });
    return () => controller.abort();
  }, [armToken, offlineData, setSelectedSub]);

  // Load vaults, roles, and assignments when subscription changes
  useEffect(() => {
    if (!selectedSub) return;
    const controller = new AbortController();
    const { signal } = controller;
    setStatus(MigrationStatus.LOADING);
    setError(null);
    setSelectedVault(null);

    if (offlineData) {
      setVaults(offlineData.vaults);
      setAvailableRoles(offlineData.roles);
      setRoleAssignments([]);
      setStatus(MigrationStatus.IDLE);
      return;
    }

    const loadData = async () => {
      try {
        const [fetchedRoles, fetchedAssignments] = await Promise.all([
          getRoleDefinitions(armToken, selectedSub.subscriptionId, signal),
          getRoleAssignments(armToken, selectedSub.subscriptionId, signal),
        ]);
        signal.throwIfAborted();
        const fetchedVaults = await getKeyVaults(armToken, selectedSub.subscriptionId, fetchedAssignments, signal);
        signal.throwIfAborted();
        setVaults(fetchedVaults);
        setAvailableRoles(fetchedRoles);
        setRoleAssignments(fetchedAssignments);
        setStatus(MigrationStatus.IDLE);
      } catch (e) {
        if (signal.aborted) return;
        console.error('Failed to load Azure data:', e);
        setError(e instanceof Error ? e.message : 'Failed to load Azure data.');
        setStatus(MigrationStatus.ERROR);
      }
    };
    void loadData();
    return () => controller.abort();
  }, [selectedSub, armToken, offlineData]);

  // Resolve identities
  const resolveIdentities = useCallback(
    async (objectIds: string[], applicationIds: string[] = []) => {
      // Identity resolution requires a Graph-scoped token. Without one, the call would
      // always 401 against the Management token, so skip it instead of logging noise.
      const { signal } = identityRequests.current;
      if (signal.aborted || offlineData || !graphToken || (objectIds.length === 0 && applicationIds.length === 0)) return;

      const resolved = await resolveBatchIdentities(objectIds, graphToken, applicationIds, signal);
      if (!signal.aborted) setResolvedNames((prev) => ({ ...prev, ...resolved }));
    },
    [graphToken, offlineData]
  );

  return {
    subscriptions,
    selectedSub,
    setSelectedSub,
    vaults,
    selectedVault,
    setSelectedVault,
    availableRoles,
    roleAssignments,
    resolvedNames,
    status,
    error,
    setStatus,
    resolveIdentities,
  };
};
