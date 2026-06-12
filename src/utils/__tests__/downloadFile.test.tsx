import { describe, it, expect, vi, afterEach } from 'vitest';
import { downloadFile } from '../exportUtils';

describe('downloadFile', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('builds a blob anchor, triggers the download, and cleans up', () => {
        const createObjectURL = vi.fn((_blob: Blob) => 'blob:fake-url');
        const revokeObjectURL = vi.fn();
        vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });

        const clicked: HTMLAnchorElement[] = [];
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
            this: HTMLAnchorElement
        ) {
            clicked.push(this);
        });
        const appendSpy = vi.spyOn(document.body, 'appendChild');
        const removeSpy = vi.spyOn(document.body, 'removeChild');

        downloadFile('Identity,Role\nAlice,Reader', 'vault-migration.csv', 'text/csv');

        expect(createObjectURL).toHaveBeenCalledTimes(1);
        const blobArg = createObjectURL.mock.calls[0][0] as Blob;
        expect(blobArg).toBeInstanceOf(Blob);
        expect(blobArg.type).toBe('text/csv');

        expect(clicked).toHaveLength(1);
        expect(clicked[0].download).toBe('vault-migration.csv');
        expect(clicked[0].href).toContain('blob:fake-url');

        expect(appendSpy).toHaveBeenCalledTimes(1);
        expect(removeSpy).toHaveBeenCalledTimes(1);
        expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake-url');
    });
});
