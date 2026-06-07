import { useState, useEffect, useCallback } from 'react';
import {
    Subscription,
    KeyVault,
    RoleDefinition,
    RoleAssignment,
    IdentityType,
    MigrationStatus,
} from '../types';
import {
    getSubscriptions,
    getKeyVaults,
    getRoleDefinitions,
    getRoleAssignments,
    resolveBatchIdentities,
} from '../services/azureService';

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
    setStatus: (status: MigrationStatus) => void;
    resolveIdentities: (objectIds: string[]) => Promise<void>;
}

/**
 * Hook for managing Azure data fetching and state
 */
export const useAzureData = ({
    armToken,
    graphToken,
    offlineData,
}: UseAzureDataProps): UseAzureDataResult => {
    const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
    const [selectedSub, setSelectedSub] = useState<Subscription | null>(null);
    const [vaults, setVaults] = useState<KeyVault[]>([]);
    const [selectedVault, setSelectedVault] = useState<KeyVault | null>(null);
    const [availableRoles, setAvailableRoles] = useState<RoleDefinition[]>([]);
    const [roleAssignments, setRoleAssignments] = useState<RoleAssignment[]>([]);
    const [resolvedNames, setResolvedNames] = useState<
        Record<string, { name: string; type: IdentityType }>
    >({});
    const [status, setStatus] = useState<MigrationStatus>(MigrationStatus.LOADING);

    // Load subscriptions
    useEffect(() => {
        let active = true;

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

            try {
                const subs = await getSubscriptions(armToken);
                if (!active) return;
                setSubscriptions(subs);
                setStatus(MigrationStatus.IDLE);
            } catch (error) {
                if (!active) return;
                console.error('Failed to load subscriptions:', error);
                setStatus(MigrationStatus.ERROR);
            }
        };

        loadSubscriptions();
        return () => {
            active = false;
        };
    }, [armToken, offlineData]);

    // Load vaults, roles, and assignments when subscription changes
    useEffect(() => {
        if (!selectedSub) return;

        let active = true;
        setStatus(MigrationStatus.LOADING);

        if (offlineData) {
            setVaults(offlineData.vaults);
            setAvailableRoles(offlineData.roles);
            setRoleAssignments([]);
            setStatus(MigrationStatus.IDLE);
        } else {
            Promise.all([
                getKeyVaults(armToken, selectedSub.subscriptionId),
                getRoleDefinitions(armToken, selectedSub.subscriptionId),
                getRoleAssignments(armToken, selectedSub.subscriptionId),
            ])
                .then(([fetchedVaults, fetchedRoles, fetchedAssignments]) => {
                    // Ignore results from a superseded subscription selection.
                    if (!active) return;
                    setVaults(fetchedVaults);
                    setAvailableRoles(fetchedRoles);
                    setRoleAssignments(fetchedAssignments);
                    setStatus(MigrationStatus.IDLE);
                })
                .catch((error) => {
                    if (!active) return;
                    console.error('Failed to load Azure data:', error);
                    setStatus(MigrationStatus.ERROR);
                });
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
        async (objectIds: string[]) => {
            // Identity resolution requires a Graph-scoped token. Without one, the call would
            // always 401 against the Management token, so skip it instead of logging noise.
            if (offlineData || objectIds.length === 0 || !graphToken) return;

            const resolved = await resolveBatchIdentities(objectIds, graphToken);
            setResolvedNames((prev) => ({ ...prev, ...resolved }));
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
        setStatus,
        resolveIdentities,
    };
};
