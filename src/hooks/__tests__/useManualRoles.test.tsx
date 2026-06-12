import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRoot } from 'solid-js';
import { useManualRoles } from '../useManualRoles';
import { makeRole } from '../../test/factories';
import * as azureService from '../../services/azureService';
import * as builtInRoles from '../../utils/builtInRoles';
import * as roleNormalization from '../../utils/roleNormalization';

vi.mock('../../services/azureService', () => ({
    validateToken: vi.fn(),
    getSubscriptions: vi.fn(),
    getRoleDefinitions: vi.fn(),
}));
vi.mock('../../utils/builtInRoles', () => ({ getBuiltInKeyVaultRoles: vi.fn() }));
vi.mock('../../utils/roleNormalization', () => ({ parseRolesJson: vi.fn() }));

const tick = () => new Promise((r) => setTimeout(r, 0));
const builtins = [makeRole('KV Reader', ['a']), makeRole('KV Admin', ['b'])];

describe('useManualRoles', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (builtInRoles.getBuiltInKeyVaultRoles as any).mockReturnValue(builtins);
    });

    it('defaults to built-in roles', () => {
        createRoot((dispose) => {
            const m = useManualRoles();
            expect(m.roleSource()).toBe('builtin');
            expect(m.activeRoles()).toEqual(builtins);
            expect(m.sourceStatus()).toBe('2 built-in roles loaded');
            dispose();
        });
    });

    it('parses pasted JSON live and surfaces parse errors', async () => {
        const parsed = [makeRole('Pasted', ['x'])];
        (roleNormalization.parseRolesJson as any).mockImplementation((s: string) => {
            if (s.includes('bad')) throw new Error('Invalid JSON.');
            return parsed;
        });
        await createRoot(async (dispose) => {
            const m = useManualRoles();
            m.setRoleSource('paste');
            m.setPasteJson('{"good":true}');
            await tick();
            expect(m.activeRoles()).toEqual(parsed);
            expect(m.pasteError()).toBeNull();
            expect(m.sourceStatus()).toBe('1 roles parsed');

            m.setPasteJson('bad');
            await tick();
            expect(m.activeRoles()).toEqual([]);
            expect(m.pasteError()).toBe('Invalid JSON.');
            dispose();
        });
    });

    it('requires a token before loading subscriptions', async () => {
        await createRoot(async (dispose) => {
            const m = useManualRoles();
            await m.loadSubscriptions();
            expect(m.tokenError()).toBe('Paste a Management token first.');
            expect(azureService.getSubscriptions).not.toHaveBeenCalled();
            dispose();
        });
    });

    it('loads subscriptions then roles from a live token', async () => {
        (azureService.validateToken as any).mockResolvedValue(undefined);
        (azureService.getSubscriptions as any).mockResolvedValue([
            { id: 's', displayName: 'S', subscriptionId: 'sub-1' },
        ]);
        (azureService.getRoleDefinitions as any).mockResolvedValue([makeRole('Tok', ['z'])]);
        await createRoot(async (dispose) => {
            const m = useManualRoles();
            m.setRoleSource('token');
            m.setToken('tok');

            await m.loadSubscriptions();
            expect(azureService.validateToken).toHaveBeenCalledWith('tok');
            expect(m.subscriptions()).toHaveLength(1);
            expect(m.selectedSubId()).toBe('sub-1');

            await m.loadRoles();
            expect(azureService.getRoleDefinitions).toHaveBeenCalledWith('tok', 'sub-1');
            expect(m.activeRoles()).toHaveLength(1);
            expect(m.sourceStatus()).toBe('1 roles loaded');
            dispose();
        });
    });

    it('clears loaded roles when the subscription changes', async () => {
        (azureService.getRoleDefinitions as any).mockResolvedValue([makeRole('Tok', ['z'])]);
        await createRoot(async (dispose) => {
            const m = useManualRoles();
            m.setRoleSource('token');
            m.setToken('tok');
            m.selectSubscription('sub-1');
            await m.loadRoles();
            expect(m.activeRoles()).toHaveLength(1);

            m.selectSubscription('sub-2');
            expect(m.activeRoles()).toEqual([]);
            dispose();
        });
    });
});
