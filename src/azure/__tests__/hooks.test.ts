import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAzureData } from '../../ui/hooks/useAzureData';
import { useManualRoles } from '../../ui/hooks/useManualRoles';
import {
  getKeyVaults, getRoleAssignments, getRoleDefinitions, getSubscriptions,
  resolveBatchIdentities, validateToken,
} from '../client';
import { KeyVault, MigrationStatus, RoleAssignment, RoleDefinition, Subscription } from '../../core/types';

// A deterministic hook scheduler keeps async state-machine tests in the existing Node runner.
const hooks = vi.hoisted(() => {
  interface Slot {
    value?: unknown;
    deps?: readonly unknown[];
    cleanup?: () => void;
    setter?: (value: unknown) => void;
  }
  const slots: Slot[] = [];
  let cursor = 0;
  let dirty = false;
  let effects: Array<() => void> = [];
  const changed = (left?: readonly unknown[], right?: readonly unknown[]) =>
    !left || !right || left.length !== right.length || left.some((v, i) => !Object.is(v, right[i]));
  const next = () => slots[cursor++] ?? (slots[cursor - 1] = {});
  const useMemo = <T,>(factory: () => T, deps: readonly unknown[]): T => {
    const slot = next();
    if (changed(slot.deps, deps)) {
      slot.value = factory();
      slot.deps = deps;
    }
    return slot.value as T;
  };
  return {
    reset() {
      slots.length = 0;
      cursor = 0;
      effects = [];
      dirty = false;
    },
    render<T>(hook: () => T): T {
      let result: T;
      let renders = 0;
      do {
        if (++renders > 30) throw new Error('Hook render loop');
        dirty = false;
        cursor = 0;
        result = hook();
        const pending = effects;
        effects = [];
        pending.forEach((effect) => effect());
      } while (dirty);
      return result;
    },
    unmount() {
      slots.forEach((slot) => slot.cleanup?.());
    },
    useState<T>(initial: T | (() => T)) {
      const slot = next();
      if (!slot.setter) {
        slot.value = typeof initial === 'function' ? (initial as () => T)() : initial;
        slot.setter = (value: unknown) => {
          const updated = typeof value === 'function' ? value(slot.value) : value;
          if (!Object.is(slot.value, updated)) {
            slot.value = updated;
            dirty = true;
          }
        };
      }
      return [slot.value, slot.setter];
    },
    useRef<T>(initial: T) {
      const slot = next();
      if (!slot.value) slot.value = { current: initial };
      return slot.value;
    },
    useEffect(effect: () => (() => void) | void, deps?: readonly unknown[]) {
      const slot = next();
      if (changed(slot.deps, deps)) {
        slot.deps = deps;
        effects.push(() => {
          slot.cleanup?.();
          slot.cleanup = effect() || undefined;
        });
      }
    },
    useMemo,
    useCallback<T>(callback: T, deps: readonly unknown[]) {
      return useMemo(() => callback, deps);
    },
  };
});
vi.mock('react', () => hooks);
vi.mock('../client', () => ({
  getSubscriptions: vi.fn(), getRoleDefinitions: vi.fn(), getRoleAssignments: vi.fn(),
  getKeyVaults: vi.fn(), resolveBatchIdentities: vi.fn(), validateToken: vi.fn(),
}));

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
const sub: Subscription = { id: '/subscriptions/a', subscriptionId: 'a', displayName: 'A' };
const otherSub: Subscription = { id: '/subscriptions/b', subscriptionId: 'b', displayName: 'B' };
const vault: KeyVault = { id: 'vault', name: 'vault', location: 'eastus', sku: 'Standard', accessPolicies: [] };
const role: RoleDefinition = {
  id: 'role', name: 'role', type: 'role',
  properties: { roleName: 'Role', description: '', type: 'CustomRole', permissions: [], assignableScopes: [] },
};
const assignment: RoleAssignment = {
  id: 'assignment', name: 'assignment', type: 'assignment',
  properties: { principalId: 'p', principalType: 'User', roleDefinitionId: 'role', scope: 'vault' },
};

beforeEach(() => {
  hooks.reset();
  vi.mocked(getSubscriptions).mockResolvedValue([sub, otherSub]);
  vi.mocked(getRoleDefinitions).mockResolvedValue([role]);
  vi.mocked(getRoleAssignments).mockResolvedValue([assignment]);
  vi.mocked(getKeyVaults).mockResolvedValue([vault]);
  vi.mocked(resolveBatchIdentities).mockResolvedValue({});
  vi.mocked(validateToken).mockResolvedValue(undefined);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  hooks.unmount();
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

describe('useAzureData request ownership', () => {
  it('exposes subscription/data errors and resets stale data and errors on selection changes', async () => {
    vi.mocked(getSubscriptions).mockRejectedValueOnce(new Error('subscriptions denied'));
    let props = { armToken: 'first', graphToken: 'graph' };
    const render = () => hooks.render(() => useAzureData(props));
    render();
    await settle();
    expect(render()).toMatchObject({ status: MigrationStatus.ERROR, error: 'subscriptions denied' });

    props = { ...props, armToken: 'second' };
    expect(render()).toMatchObject({ status: MigrationStatus.LOADING, error: null });
    await settle();
    render().setSelectedSub(sub);
    render();
    await settle();
    expect(render()).toMatchObject({ vaults: [vault], availableRoles: [role], roleAssignments: [assignment] });
    expect(getRoleAssignments).toHaveBeenCalledTimes(1);
    expect(getKeyVaults).toHaveBeenCalledWith('second', 'a', [assignment]);

    vi.mocked(getRoleDefinitions).mockRejectedValueOnce(new Error('roles denied'));
    render().setSelectedSub(otherSub);
    expect(render()).toMatchObject({
      vaults: [], availableRoles: [], roleAssignments: [], error: null, status: MigrationStatus.LOADING,
    });
    await settle();
    expect(render()).toMatchObject({ error: 'roles denied', status: MigrationStatus.ERROR });
    render().setSelectedSub(null);
    expect(render()).toMatchObject({
      selectedSub: null, selectedVault: null, error: null, status: MigrationStatus.IDLE,
      vaults: [], availableRoles: [], roleAssignments: [],
    });
  });

  it('ignores stale vault success/failure and does not leave cleared selections loading', async () => {
    const oldVaults = deferred<KeyVault[]>();
    vi.mocked(getKeyVaults).mockReturnValueOnce(oldVaults.promise);
    const render = () => hooks.render(() => useAzureData({ armToken: 'token' }));
    render();
    await settle();
    render().setSelectedSub(sub);
    render();
    await settle();
    render().setSelectedSub(null);
    render();
    oldVaults.reject(new Error('old vault failed'));
    await settle();
    expect(render()).toMatchObject({ error: null, vaults: [], status: MigrationStatus.IDLE });
  });

  it('ignores stale subscriptions after token replacement', async () => {
    const oldSubs = deferred<Subscription[]>();
    vi.mocked(getSubscriptions).mockReturnValueOnce(oldSubs.promise);
    let token = 'old';
    const render = () => hooks.render(() => useAzureData({ armToken: token }));
    render();
    token = 'new';
    render();
    await settle();
    oldSubs.resolve([{ ...sub, displayName: 'Stale' }]);
    await settle();
    expect(render().subscriptions).toEqual([sub, otherSub]);
    expect(render().error).toBeNull();
  });

  it.each(['subscription', 'token', 'unmount'])('ignores Graph results after %s changes', async (change) => {
    const names = deferred<Awaited<ReturnType<typeof resolveBatchIdentities>>>();
    vi.mocked(resolveBatchIdentities).mockReturnValueOnce(names.promise);
    let token = 'graph';
    const render = () => hooks.render(() => useAzureData({ armToken: 'arm', graphToken: token }));
    render();
    await settle();
    render().setSelectedSub(sub);
    render();
    await settle();
    const pending = render().resolveIdentities(['p'], ['app']);
    expect(resolveBatchIdentities).toHaveBeenCalledWith(['p'], 'graph', ['app']);
    if (change === 'subscription') {
      render().setSelectedSub(otherSub);
      render();
    } else if (change === 'token') {
      token = 'replacement';
      render();
    } else {
      hooks.unmount();
    }
    names.resolve({ p: { name: 'Old name', type: 'User' } });
    await pending;
    expect(render().resolvedNames).toEqual({});
  });

  it('retains the offline shape without making network calls', async () => {
    const props = { armToken: '', offlineData: { vaults: [vault], roles: [role] } };
    const render = () => hooks.render(() => useAzureData(props));
    render().setSelectedSub(render().subscriptions[0]);
    expect(render()).toMatchObject({
      vaults: [vault], availableRoles: [role], roleAssignments: [], error: null, status: MigrationStatus.IDLE,
    });
    await render().resolveIdentities(['p']);
    expect(getSubscriptions).not.toHaveBeenCalled();
    expect(getKeyVaults).not.toHaveBeenCalled();
    expect(resolveBatchIdentities).not.toHaveBeenCalled();
  });
});

describe('useManualRoles request ownership', () => {
  it('stops stale token validation before requesting subscriptions and clears loading', async () => {
    const validation = deferred<void>();
    vi.mocked(validateToken).mockReturnValueOnce(validation.promise);
    const render = () => hooks.render(useManualRoles);
    render().setToken('old');
    const pending = render().loadSubscriptions();
    expect(render().loadingSubs).toBe(true);
    render().setToken('new');
    expect(render()).toMatchObject({ loadingSubs: false, loadingRoles: false, tokenError: null });
    validation.resolve(undefined);
    await pending;
    expect(getSubscriptions).not.toHaveBeenCalled();
    expect(render().subscriptions).toEqual([]);
  });

  it('does not publish subscriptions for a superseded token', async () => {
    const subscriptions = deferred<Subscription[]>();
    vi.mocked(getSubscriptions).mockReturnValueOnce(subscriptions.promise);
    const render = () => hooks.render(useManualRoles);
    render().setToken('old');
    const pending = render().loadSubscriptions();
    await settle();
    render().setToken('new');
    subscriptions.resolve([sub]);
    await pending;
    expect(render()).toMatchObject({ subscriptions: [], selectedSubId: '', loadingSubs: false });
  });

  it('ignores old role responses and their finally blocks while a new subscription loads', async () => {
    const oldRoles = deferred<RoleDefinition[]>();
    const newRoles = deferred<RoleDefinition[]>();
    vi.mocked(getRoleDefinitions).mockReturnValueOnce(oldRoles.promise).mockReturnValueOnce(newRoles.promise);
    const render = () => hooks.render(useManualRoles);
    render().setRoleSource('token');
    render().setToken('token');
    render().selectSubscription('a');
    const first = render().loadRoles();
    render().selectSubscription('b');
    expect(render()).toMatchObject({ activeRoles: [], loadingRoles: false, tokenError: null });
    const second = render().loadRoles();
    oldRoles.reject(new Error('old failure'));
    await first;
    expect(render()).toMatchObject({ activeRoles: [], loadingRoles: true, tokenError: null });
    newRoles.resolve([role]);
    await second;
    expect(render()).toMatchObject({ activeRoles: [role], loadingRoles: false });
    render().setToken('new-token');
    expect(render()).toMatchObject({ activeRoles: [], subscriptions: [], selectedSubId: '', tokenError: null });
  });

  it('clears errors on input changes and ignores role success after unmount', async () => {
    const roles = deferred<RoleDefinition[]>();
    vi.mocked(getRoleDefinitions).mockReturnValueOnce(roles.promise);
    const render = () => hooks.render(useManualRoles);
    await render().loadSubscriptions();
    expect(render().tokenError).toContain('Management token');
    render().setToken('token');
    expect(render().tokenError).toBeNull();
    render().setRoleSource('token');
    render().selectSubscription('a');
    const pending = render().loadRoles();
    hooks.unmount();
    roles.resolve([role]);
    await pending;
    expect(render().activeRoles).toEqual([]);
  });
});
