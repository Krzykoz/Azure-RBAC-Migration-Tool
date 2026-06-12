import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRoot } from 'solid-js';
import { MigrationStatus } from '../../types';
import { useAzureData } from '../useAzureData';
import * as azureService from '../../services/azureService';

vi.mock('../../services/azureService', () => ({
    getSubscriptions: vi.fn(),
    getKeyVaults: vi.fn(),
    getRoleDefinitions: vi.fn(),
    getRoleAssignments: vi.fn(),
    resolveBatchIdentities: vi.fn(),
}));

const tick = () => new Promise((r) => setTimeout(r, 0));
const sub = { id: '/subscriptions/s1', displayName: 'Sub 1', subscriptionId: 's1' };
const vault = (id: string) => ({ id, name: id, location: '', sku: '', accessPolicies: [] });

describe('useAzureData', () => {
    beforeEach(() => vi.clearAllMocks());

    it('loads subscriptions online and goes IDLE', async () => {
        (azureService.getSubscriptions as any).mockResolvedValue([sub]);
        await createRoot(async (dispose) => {
            const d = useAzureData({
                armToken: () => 'tok',
                graphToken: () => undefined,
                offlineData: () => null,
            });
            await tick();
            expect(azureService.getSubscriptions).toHaveBeenCalledWith('tok');
            expect(d.subscriptions()).toEqual([sub]);
            expect(d.status()).toBe(MigrationStatus.IDLE);
            dispose();
        });
    });

    it('sets ERROR when the subscription load fails', async () => {
        (azureService.getSubscriptions as any).mockRejectedValue(new Error('boom'));
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        await createRoot(async (dispose) => {
            const d = useAzureData({
                armToken: () => 'tok',
                graphToken: () => undefined,
                offlineData: () => null,
            });
            await tick();
            expect(d.status()).toBe(MigrationStatus.ERROR);
            dispose();
        });
        errSpy.mockRestore();
    });

    it('serves offline data without hitting the network', async () => {
        const offline = { vaults: [vault('v1')], roles: [] };
        await createRoot(async (dispose) => {
            const d = useAzureData({
                armToken: () => '',
                graphToken: () => undefined,
                offlineData: () => offline,
            });
            await tick();
            expect(azureService.getSubscriptions).not.toHaveBeenCalled();
            expect(d.subscriptions()[0].subscriptionId).toBe('offline-sub');
            expect(d.status()).toBe(MigrationStatus.IDLE);

            d.setSelectedSub(d.subscriptions()[0]);
            await tick();
            expect(azureService.getKeyVaults).not.toHaveBeenCalled();
            expect(d.vaults()).toEqual(offline.vaults);
            expect(d.availableRoles()).toEqual(offline.roles);
            expect(d.roleAssignments()).toEqual([]);
            dispose();
        });
    });

    it('loads vaults/roles/assignments on subscription select and resets the vault', async () => {
        (azureService.getSubscriptions as any).mockResolvedValue([sub]);
        (azureService.getKeyVaults as any).mockResolvedValue([vault('v1')]);
        (azureService.getRoleDefinitions as any).mockResolvedValue([{ name: 'r' }]);
        (azureService.getRoleAssignments as any).mockResolvedValue([{ name: 'a' }]);
        await createRoot(async (dispose) => {
            const d = useAzureData({
                armToken: () => 'tok',
                graphToken: () => undefined,
                offlineData: () => null,
            });
            await tick();
            d.setSelectedVault(vault('stale'));
            d.setSelectedSub(sub);
            await tick();
            expect(azureService.getKeyVaults).toHaveBeenCalledWith('tok', 's1');
            expect(d.vaults()).toHaveLength(1);
            expect(d.availableRoles()).toHaveLength(1);
            expect(d.roleAssignments()).toHaveLength(1);
            expect(d.selectedVault()).toBeNull();
            dispose();
        });
    });

    it('resolveIdentities is a no-op without a graph token', async () => {
        await createRoot(async (dispose) => {
            const d = useAzureData({
                armToken: () => 'tok',
                graphToken: () => undefined,
                offlineData: () => null,
            });
            await d.resolveIdentities(['id1']);
            expect(azureService.resolveBatchIdentities).not.toHaveBeenCalled();
            dispose();
        });
    });

    it('resolveIdentities merges resolved names when a graph token exists', async () => {
        (azureService.resolveBatchIdentities as any).mockResolvedValue({
            id1: { name: 'Alice', type: 'User' },
        });
        await createRoot(async (dispose) => {
            const d = useAzureData({
                armToken: () => 'tok',
                graphToken: () => 'graph',
                offlineData: () => null,
            });
            await d.resolveIdentities(['id1']);
            expect(azureService.resolveBatchIdentities).toHaveBeenCalledWith(['id1'], 'graph');
            expect(d.resolvedNames()['id1']).toEqual({ name: 'Alice', type: 'User' });
            dispose();
        });
    });
});
