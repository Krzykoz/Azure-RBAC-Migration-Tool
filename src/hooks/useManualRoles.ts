import { createSignal, createMemo, createEffect, on, type Accessor } from 'solid-js';
import { RoleDefinition, Subscription } from '../types';
import { getBuiltInKeyVaultRoles } from '../utils/builtInRoles';
import { parseRolesJson } from '../utils/roleNormalization';
import { validateToken, getSubscriptions, getRoleDefinitions } from '../services/azureService';

export type RoleSource = 'builtin' | 'paste' | 'token';

export interface UseManualRoles {
    roleSource: Accessor<RoleSource>;
    setRoleSource: (source: RoleSource) => void;
    activeRoles: Accessor<RoleDefinition[]>;
    sourceStatus: Accessor<string>;

    // Paste source
    pasteJson: Accessor<string>;
    setPasteJson: (value: string) => void;
    pasteError: Accessor<string | null>;

    // Live token source
    token: Accessor<string>;
    setToken: (value: string) => void;
    subscriptions: Accessor<Subscription[]>;
    selectedSubId: Accessor<string>;
    selectSubscription: (id: string) => void;
    loadingSubs: Accessor<boolean>;
    loadingRoles: Accessor<boolean>;
    tokenError: Accessor<string | null>;
    loadSubscriptions: () => Promise<void>;
    loadRoles: () => Promise<void>;
}

/**
 * Owns the "where do role definitions come from" state machine: built-in
 * (offline), pasted JSON (parsed live), or a live management token. Exposes the
 * resolved `activeRoles` for the chosen source plus a human-readable status.
 */
export const useManualRoles = (): UseManualRoles => {
    const [roleSource, setRoleSource] = createSignal<RoleSource>('builtin');

    // Paste source
    const [pasteJson, setPasteJson] = createSignal('');
    const [pastedRoles, setPastedRoles] = createSignal<RoleDefinition[]>([]);
    const [pasteError, setPasteError] = createSignal<string | null>(null);

    // Live token source
    const [token, setToken] = createSignal('');
    const [subscriptions, setSubscriptions] = createSignal<Subscription[]>([]);
    const [selectedSubId, setSelectedSubId] = createSignal('');
    const [loadingSubs, setLoadingSubs] = createSignal(false);
    const [loadingRoles, setLoadingRoles] = createSignal(false);
    const [tokenRoles, setTokenRoles] = createSignal<RoleDefinition[]>([]);
    const [tokenError, setTokenError] = createSignal<string | null>(null);

    const builtInRoles = getBuiltInKeyVaultRoles();

    const activeRoles = createMemo<RoleDefinition[]>(() =>
        roleSource() === 'builtin'
            ? builtInRoles
            : roleSource() === 'paste'
              ? pastedRoles()
              : tokenRoles()
    );

    // Parse pasted JSON live as the user types.
    createEffect(
        on([pasteJson, roleSource], () => {
            if (roleSource() !== 'paste') return;
            if (!pasteJson().trim()) {
                setPastedRoles([]);
                setPasteError(null);
                return;
            }
            try {
                setPastedRoles(parseRolesJson(pasteJson()));
                setPasteError(null);
            } catch (e: any) {
                setPastedRoles([]);
                setPasteError(e?.message || 'Invalid JSON.');
            }
        })
    );

    const selectSubscription = (id: string) => {
        setSelectedSubId(id);
        setTokenRoles([]);
    };

    const loadSubscriptions = async () => {
        setTokenError(null);
        setSubscriptions([]);
        setSelectedSubId('');
        setTokenRoles([]);

        // Capture the token once so validation and the subscription fetch use the
        // same value even if the field is edited while the request is in flight.
        const trimmedToken = token().trim();
        if (!trimmedToken) {
            setTokenError('Paste a Management token first.');
            return;
        }

        setLoadingSubs(true);
        try {
            await validateToken(trimmedToken);
            const subs = await getSubscriptions(trimmedToken);
            if (subs.length === 0) {
                setTokenError('Token is valid, but no subscriptions are visible to it.');
                return;
            }
            setSubscriptions(subs);
            setSelectedSubId(subs[0].subscriptionId);
        } catch (e: any) {
            setTokenError(e?.message || 'Failed to validate token.');
        } finally {
            setLoadingSubs(false);
        }
    };

    const loadRoles = async () => {
        setTokenError(null);
        setTokenRoles([]);
        const subId = selectedSubId();
        if (!subId) {
            setTokenError('Select a subscription first.');
            return;
        }
        setLoadingRoles(true);
        try {
            const roles = await getRoleDefinitions(token().trim(), subId);
            if (roles.length === 0) {
                setTokenError(
                    'Connected, but no Key Vault roles were found in the selected subscription.'
                );
                return;
            }
            setTokenRoles(roles);
        } catch (e: any) {
            setTokenError(e?.message || 'Failed to load role definitions.');
        } finally {
            setLoadingRoles(false);
        }
    };

    const sourceStatus = createMemo<string>(() => {
        if (roleSource() === 'builtin') return `${builtInRoles.length} built-in roles loaded`;
        if (roleSource() === 'paste')
            return pastedRoles().length > 0
                ? `${pastedRoles().length} roles parsed`
                : 'No roles parsed yet';
        return tokenRoles().length > 0 ? `${tokenRoles().length} roles loaded` : 'No roles loaded yet';
    });

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
