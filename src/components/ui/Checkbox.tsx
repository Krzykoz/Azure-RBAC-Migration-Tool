import { Show, type JSX } from 'solid-js';

interface CheckboxProps {
    checked: boolean;
    indeterminate?: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
    class?: string;
}

/**
 * Custom checkbox rendered as a button so it can show an indeterminate ("mixed")
 * state that native checkboxes cannot express declaratively.
 */
export const Checkbox = (props: CheckboxProps): JSX.Element => (
    <button
        type="button"
        role="checkbox"
        aria-checked={props.indeterminate ? 'mixed' : props.checked}
        disabled={props.disabled}
        onClick={() => props.onChange(!props.checked)}
        class={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all shrink-0 ${props.checked || props.indeterminate
                ? 'bg-brand-600 border-brand-600 text-white'
                : 'bg-white dark:bg-neutral-700 border-neutral-300 dark:border-neutral-500 hover:border-brand-400'
            } ${props.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${props.class || ''}`}
    >
        <Show when={props.checked}>
            <svg class="w-2.5 h-2.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M2 6l3 3 5-5" />
            </svg>
        </Show>
        <Show when={props.indeterminate && !props.checked}>
            <svg class="w-2.5 h-2.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M2 6h8" />
            </svg>
        </Show>
    </button>
);
