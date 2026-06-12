import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@solidjs/testing-library';
import { Checkbox } from '../Checkbox';

describe('Checkbox', () => {
    it('renders unchecked with aria-checked=false and no glyph', () => {
        const { getByRole, container } = render(() => (
            <Checkbox checked={false} onChange={() => {}} />
        ));
        expect(getByRole('checkbox')).toHaveAttribute('aria-checked', 'false');
        expect(container.querySelector('svg')).toBeNull();
    });

    it('shows the check glyph and aria-checked=true when checked', () => {
        const { getByRole, container } = render(() => (
            <Checkbox checked={true} onChange={() => {}} />
        ));
        expect(getByRole('checkbox')).toHaveAttribute('aria-checked', 'true');
        expect(container.querySelector('path[d="M2 6l3 3 5-5"]')).not.toBeNull();
    });

    it('shows the dash glyph and aria-checked=mixed when indeterminate', () => {
        const { getByRole, container } = render(() => (
            <Checkbox checked={false} indeterminate onChange={() => {}} />
        ));
        expect(getByRole('checkbox')).toHaveAttribute('aria-checked', 'mixed');
        expect(container.querySelector('path[d="M2 6h8"]')).not.toBeNull();
    });

    it('prefers the check glyph when both checked and indeterminate', () => {
        const { container } = render(() => (
            <Checkbox checked={true} indeterminate onChange={() => {}} />
        ));
        expect(container.querySelector('path[d="M2 6l3 3 5-5"]')).not.toBeNull();
        expect(container.querySelector('path[d="M2 6h8"]')).toBeNull();
    });

    it('calls onChange with the toggled value on click', () => {
        const onChange = vi.fn();
        const { getByRole } = render(() => <Checkbox checked={false} onChange={onChange} />);
        fireEvent.click(getByRole('checkbox'));
        expect(onChange).toHaveBeenCalledWith(true);

        const onChange2 = vi.fn();
        const { getByRole: getByRole2 } = render(() => (
            <Checkbox checked={true} onChange={onChange2} />
        ));
        fireEvent.click(getByRole2('checkbox'));
        expect(onChange2).toHaveBeenCalledWith(false);
    });

    it('marks the control disabled when disabled', () => {
        const { getByRole } = render(() => (
            <Checkbox checked={false} disabled onChange={() => {}} />
        ));
        const btn = getByRole('checkbox') as HTMLButtonElement;
        expect(btn.disabled).toBe(true);
        expect(btn.className).toContain('cursor-not-allowed');
    });

    it('forwards an extra class', () => {
        const { getByRole } = render(() => (
            <Checkbox checked={false} class="mt-1" onChange={() => {}} />
        ));
        expect(getByRole('checkbox').className).toContain('mt-1');
    });
});
