import { createSignal } from 'solid-js';
import { UI_CONSTANTS } from '../constants';

/**
 * Clipboard helper with transient "copied" feedback state. `copiedId` tracks the
 * id of the most recently copied item and clears itself after the configured
 * feedback duration.
 */
export const useClipboard = () => {
    const [copiedId, setCopiedId] = createSignal<string | null>(null);

    const copyToClipboard = async (text: string, id: string): Promise<boolean> => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedId(id);
            setTimeout(() => setCopiedId(null), UI_CONSTANTS.COPY_FEEDBACK_DURATION_MS);
            return true;
        } catch (err) {
            console.error('Failed to copy:', err);
            return false;
        }
    };

    const isCopied = (id: string) => copiedId() === id;

    return { copyToClipboard, isCopied, copiedId };
};
