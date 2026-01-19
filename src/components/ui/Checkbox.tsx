import React from 'react';

interface CheckboxProps {
    checked: boolean;
    indeterminate?: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
    className?: string;
}

/**
 * Custom checkbox component with support for indeterminate state
 */
export const Checkbox: React.FC<CheckboxProps> = ({
    checked,
    indeterminate,
    onChange,
    disabled,
    className,
}) => (
    <button
        type="button"
        role="checkbox"
        aria-checked={indeterminate ? 'mixed' : checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all shrink-0 ${checked || indeterminate
                ? 'bg-brand-600 border-brand-600 text-white'
                : 'bg-white dark:bg-neutral-700 border-neutral-300 dark:border-neutral-500 hover:border-brand-400'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${className || ''}`}
    >
        {checked && (
            <svg className="w-2.5 h-2.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M2 6l3 3 5-5" />
            </svg>
        )}
        {indeterminate && !checked && (
            <svg className="w-2.5 h-2.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M2 6h8" />
            </svg>
        )}
    </button>
);
