import { useState, useCallback } from 'react';
import { UI_CONSTANTS } from '../constants';

/**
 * Hook for clipboard operations with feedback state
 */
export const useClipboard = () => {
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const copyToClipboard = useCallback(async (text: string, id: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedId(id);
            setTimeout(() => setCopiedId(null), UI_CONSTANTS.COPY_FEEDBACK_DURATION_MS);
            return true;
        } catch (err) {
            console.error('Failed to copy:', err);
            return false;
        }
    }, []);

    const isCopied = useCallback((id: string) => copiedId === id, [copiedId]);

    return { copyToClipboard, isCopied, copiedId };
};
