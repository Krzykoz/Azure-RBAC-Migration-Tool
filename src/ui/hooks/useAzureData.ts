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
  const selectedSubRef = useRef<Subscription | null>(null);
  const latestInputs = useRef({ armToken, graphToken, offlineData });
  latestInputs.current = { armToken, graphToken, offlineData };
  const identityGeneration = useRef(0);
  const selectionGeneration = useRef(0);
  const mounted = useRef(false);

  const setSelectedSub = useCallback((sub: Subscription | null) => {
    if (sub && selectedSubRef.current === sub) return;
    selectedSubRef.current = sub;
    selectionGeneration.current++;
    identityGeneration.current++;
    setSelectedSubState(sub);
    setVaults([]);
    setAvailableRoles([]);
    setRoleAssignments([]);
    setSelectedVault(null);
    setResolvedNames({});
    setError(null);
    setStatus(sub ? MigrationStatus.LOADING : MigrationStatus.IDLE);
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      identityGeneration.current++;
    };
  }, []);

  useEffect(() => {
    identityGeneration.current++;
    setResolvedNames({});
  }, [graphToken]);

  // Load subscriptions
  useEffect(() => {
    let active = true;
    const isCurrent = () => active &&
      latestInputs.current.armToken === armToken && latestInputs.current.offlineData === offlineData;
    setSelectedSub(null);
    setSubscriptions([]);
    setStatus(MigrationStatus.LOADING);

    const loadSubscriptions = async () => {
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

      try {
        const subs = await getSubscriptions(armToken);
        if (!isCurrent()) return;
        setSubscriptions(subs);
        setStatus(MigrationStatus.IDLE);
      } catch (e) {
        if (!isCurrent()) return;
        console.error('Failed to load subscriptions:', e);
        setError(e instanceof Error ? e.message : 'Failed to load subscriptions.');
        setStatus(MigrationStatus.ERROR);
      }
    };

    loadSubscriptions();
    return () => {
      active = false;
    };
  }, [armToken, offlineData, setSelectedSub]);

  // Load vaults, roles, and assignments when subscription changes
  useEffect(() => {
    if (!selectedSub || selectedSubRef.current !== selectedSub) return;

    let active = true;
    const generation = selectionGeneration.current;
    const isCurrent = () => active && generation === selectionGeneration.current &&
      selectedSubRef.current === selectedSub &&
      latestInputs.current.armToken === armToken && latestInputs.current.offlineData === offlineData;
    setStatus(MigrationStatus.LOADING);
    setError(null);

    if (offlineData) {
      setVaults(offlineData.vaults);
      setAvailableRoles(offlineData.roles);
      setRoleAssignments([]);
      setStatus(MigrationStatus.IDLE);
    } else {
      const loadData = async () => {
        try {
          const [fetchedRoles, fetchedAssignments] = await Promise.all([
            getRoleDefinitions(armToken, selectedSub.subscriptionId),
            getRoleAssignments(armToken, selectedSub.subscriptionId),
          ]);
          if (!isCurrent()) return;
          const fetchedVaults = await getKeyVaults(armToken, selectedSub.subscriptionId, fetchedAssignments);
          if (!isCurrent()) return;
          setVaults(fetchedVaults);
          setAvailableRoles(fetchedRoles);
          setRoleAssignments(fetchedAssignments);
          setStatus(MigrationStatus.IDLE);
        } catch (e) {
          if (!isCurrent()) return;
          console.error('Failed to load Azure data:', e);
          setError(e instanceof Error ? e.message : 'Failed to load Azure data.');
          setStatus(MigrationStatus.ERROR);
        }
      };
      void loadData();
    }

    // Reset downstream state
    setSelectedVault(null);
    setResolvedNames({});

    return () => {
      active = false;
    };
  }, [selectedSub, armToken, offlineData]);

  // Resolve identities
  const resolveIdentities = useCallback(
    async (objectIds: string[], applicationIds: string[] = []) => {
      // Identity resolution requires a Graph-scoped token. Without one, the call would
      // always 401 against the Management token, so skip it instead of logging noise.
      if (!mounted.current || offlineData || (objectIds.length === 0 && applicationIds.length === 0) || !graphToken) return;

      const generation = identityGeneration.current;
      const subscription = selectedSubRef.current;
      const resolved = await resolveBatchIdentities(objectIds, graphToken, applicationIds);
      if (!mounted.current || generation !== identityGeneration.current ||
          subscription !== selectedSubRef.current || latestInputs.current.armToken !== armToken ||
          latestInputs.current.graphToken !== graphToken || latestInputs.current.offlineData !== offlineData) return;
      setResolvedNames((prev) => ({ ...prev, ...resolved }));
    },
    [armToken, graphToken, offlineData]
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
