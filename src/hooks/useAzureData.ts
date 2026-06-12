import { createSignal, createEffect, on, onCleanup, type Accessor, type Setter } from 'solid-js';
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

type OfflineData = { vaults: KeyVault[]; roles: RoleDefinition[] } | null | undefined;

interface UseAzureDataProps {
    armToken: Accessor<string>;
    graphToken: Accessor<string | undefined>;
    offlineData: Accessor<OfflineData>;
}

export interface UseAzureData {
    subscriptions: Accessor<Subscription[]>;
    selectedSub: Accessor<Subscription | null>;
    setSelectedSub: Setter<Subscription | null>;
    vaults: Accessor<KeyVault[]>;
    selectedVault: Accessor<KeyVault | null>;
    setSelectedVault: Setter<KeyVault | null>;
    availableRoles: Accessor<RoleDefinition[]>;
    roleAssignments: Accessor<RoleAssignment[]>;
    resolvedNames: Accessor<Record<string, { name: string; type: IdentityType }>>;
    status: Accessor<MigrationStatus>;
    setStatus: Setter<MigrationStatus>;
    resolveIdentities: (objectIds: string[]) => Promise<void>;
}

/**
 * Owns Azure data fetching and the subscription -> vault drill-down state. When
 * `offlineData` is supplied it short-circuits the network and serves the pasted
 * vaults/roles instead.
 */
export const useAzureData = (props: UseAzureDataProps): UseAzureData => {
    const [subscriptions, setSubscriptions] = createSignal<Subscription[]>([]);
    const [selectedSub, setSelectedSub] = createSignal<Subscription | null>(null);
    const [vaults, setVaults] = createSignal<KeyVault[]>([]);
    const [selectedVault, setSelectedVault] = createSignal<KeyVault | null>(null);
    const [availableRoles, setAvailableRoles] = createSignal<RoleDefinition[]>([]);
    const [roleAssignments, setRoleAssignments] = createSignal<RoleAssignment[]>([]);
    const [resolvedNames, setResolvedNames] = createSignal<
        Record<string, { name: string; type: IdentityType }>
    >({});
    const [status, setStatus] = createSignal<MigrationStatus>(MigrationStatus.LOADING);

    // Load subscriptions whenever the token or offline payload changes.
    createEffect(
        on([props.armToken, props.offlineData], () => {
            const offlineData = props.offlineData();
            const armToken = props.armToken();
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
            onCleanup(() => {
                active = false;
            });
        })
    );

    // Load vaults, roles, and assignments when the selected subscription changes.
    createEffect(
        on([selectedSub, props.armToken, props.offlineData], () => {
            const sub = selectedSub();
            if (!sub) return;

            const offlineData = props.offlineData();
            const armToken = props.armToken();
            let active = true;
            setStatus(MigrationStatus.LOADING);

            if (offlineData) {
                setVaults(offlineData.vaults);
                setAvailableRoles(offlineData.roles);
                setRoleAssignments([]);
                setStatus(MigrationStatus.IDLE);
            } else {
                Promise.all([
                    getKeyVaults(armToken, sub.subscriptionId),
                    getRoleDefinitions(armToken, sub.subscriptionId),
                    getRoleAssignments(armToken, sub.subscriptionId),
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

            onCleanup(() => {
                active = false;
            });
        })
    );

    const resolveIdentities = async (objectIds: string[]): Promise<void> => {
        // Identity resolution requires a Graph-scoped token. Without one, the call would
        // always 401 against the Management token, so skip it instead of logging noise.
        if (props.offlineData() || objectIds.length === 0 || !props.graphToken()) return;

        const resolved = await resolveBatchIdentities(objectIds, props.graphToken()!);
        setResolvedNames((prev) => ({ ...prev, ...resolved }));
    };

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
