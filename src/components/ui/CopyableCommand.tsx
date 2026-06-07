import React from 'react';
import { useClipboard } from '../../hooks';
import { CopyIcon, CheckCircleIcon } from '../Icons';

interface CopyableCommandProps {
    command: string;
    commandId: string;
}

/**
 * A clickable command block that copies to clipboard on click
 */
export const CopyableCommand: React.FC<CopyableCommandProps> = ({ command, commandId }) => {
    const { copyToClipboard, isCopied } = useClipboard();

    return (
        <div
            onClick={() => copyToClipboard(command, commandId)}
            className="bg-neutral-100 dark:bg-neutral-900/50 p-2 rounded mb-2 border border-neutral-200 dark:border-neutral-700 cursor-pointer hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors group relative"
        >
            <code className="block font-mono text-[10px] text-brand-700 dark:text-brand-300 break-all select-all pr-8">
                {command}
            </code>
            <div className="absolute top-1/2 right-2 transform -translate-y-1/2 flex items-center gap-1">
                {isCopied(commandId) ? (
                    <CheckCircleIcon className="w-4 h-4 text-white dark:text-white icon-pop" />
                ) : (
                    <CopyIcon className="w-4 h-4 text-neutral-400 dark:text-neutral-500 group-hover:text-white dark:group-hover:text-white transition-all duration-200" />
                )}
            </div>
        </div>
    );
};
