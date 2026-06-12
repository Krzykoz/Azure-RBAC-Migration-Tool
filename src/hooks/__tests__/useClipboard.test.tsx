import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'solid-js';
import { useClipboard } from '../useClipboard';

describe('useClipboard', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        Object.assign(navigator, {
            clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
        });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('marks an id copied then clears it after the feedback window', async () => {
        await createRoot(async (dispose) => {
            const { copyToClipboard, isCopied, copiedId } = useClipboard();

            expect(isCopied('x')).toBe(false);

            const ok = await copyToClipboard('secret', 'x');
            expect(ok).toBe(true);
            expect(navigator.clipboard.writeText).toHaveBeenCalledWith('secret');
            expect(isCopied('x')).toBe(true);
            expect(copiedId()).toBe('x');

            vi.advanceTimersByTime(2000);
            expect(isCopied('x')).toBe(false);

            dispose();
        });
    });

    it('returns false and leaves state untouched when the copy fails', async () => {
        (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
            new Error('denied')
        );
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        await createRoot(async (dispose) => {
            const { copyToClipboard, isCopied } = useClipboard();
            const ok = await copyToClipboard('secret', 'y');
            expect(ok).toBe(false);
            expect(isCopied('y')).toBe(false);
            dispose();
        });

        errSpy.mockRestore();
    });
});
