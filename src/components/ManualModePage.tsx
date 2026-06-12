import type { JSX } from 'solid-js';

export interface ManualModePageProps {
    onBack: () => void;
    theme: 'light' | 'dark';
}

// Placeholder shell. The full manual permission picker is built in the login/offline/manual phase.
export const ManualModePage = (props: ManualModePageProps): JSX.Element => (
    <div class="p-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
        <p>Manual mode.</p>
        <button class="mt-4" onClick={() => props.onBack()}>
            Back
        </button>
    </div>
);
