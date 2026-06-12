import { Show, type JSX } from 'solid-js';
import { useClipboard } from '../../hooks';
import { CopyIcon, CheckCircleIcon } from '../Icons';

interface CopyableCommandProps {
    command: string;
    commandId: string;
}

/**
 * A clickable command block that copies its text to the clipboard, swapping the
 * copy glyph for a checkmark while the "copied" feedback window is active.
 */
export const CopyableCommand = (props: CopyableCommandProps): JSX.Element => {
    const { copyToClipboard, isCopied } = useClipboard();

    return (
        <div
            onClick={() => copyToClipboard(props.command, props.commandId)}
            class="bg-neutral-100 dark:bg-neutral-900/50 p-2 rounded mb-2 border border-neutral-200 dark:border-neutral-700 cursor-pointer hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors group relative"
        >
            <code class="block font-mono text-[10px] text-brand-700 dark:text-brand-300 break-all select-all pr-8">
                {props.command}
            </code>
            <div class="absolute top-1/2 right-2 transform -translate-y-1/2 flex items-center gap-1">
                <Show
                    when={isCopied(props.commandId)}
                    fallback={
                        <CopyIcon class="w-4 h-4 text-neutral-400 dark:text-neutral-500 group-hover:text-neutral-700 dark:group-hover:text-white transition-all duration-200" />
                    }
                >
                    <CheckCircleIcon class="w-4 h-4 text-green-600 dark:text-green-400 icon-pop" />
                </Show>
            </div>
        </div>
    );
};
