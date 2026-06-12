import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@solidjs/testing-library';
import { PermissionPicker } from '../PermissionPicker';
import { emptySelection } from '../../utils/permissionCategories';

const noop = () => {};

describe('PermissionPicker', () => {
    it('renders all four categories with their counts', () => {
        const { getByText, container } = render(() => (
            <PermissionPicker
                selected={emptySelection()}
                totalSelected={0}
                onTogglePermission={noop}
                onToggleCategoryAll={noop}
                onClearAll={noop}
            />
        ));
        expect(getByText('Keys')).toBeInTheDocument();
        expect(getByText('Secrets')).toBeInTheDocument();
        expect(getByText('Certificates')).toBeInTheDocument();
        expect(getByText('Storage')).toBeInTheDocument();
        expect(getByText('(0 selected)')).toBeInTheDocument();
        expect(container.textContent).toContain('0/20'); // keys
        expect(container.textContent).toContain('0/8'); // secrets
    });

    it('toggles a whole category and an individual permission', () => {
        const onToggleCategoryAll = vi.fn();
        const onTogglePermission = vi.fn();
        const { getAllByRole } = render(() => (
            <PermissionPicker
                selected={emptySelection()}
                totalSelected={0}
                onTogglePermission={onTogglePermission}
                onToggleCategoryAll={onToggleCategoryAll}
                onClearAll={noop}
            />
        ));
        const checkboxes = getAllByRole('checkbox');
        fireEvent.click(checkboxes[0]); // keys category-all
        expect(onToggleCategoryAll).toHaveBeenCalledWith('keys');
        fireEvent.click(checkboxes[1]); // keys "Get"
        expect(onTogglePermission).toHaveBeenCalledWith('keys', 'Get');
    });

    it('marks a partially selected category as indeterminate', () => {
        const selected = emptySelection();
        selected.keys.add('Get');
        const { getAllByRole, container } = render(() => (
            <PermissionPicker
                selected={selected}
                totalSelected={1}
                onTogglePermission={noop}
                onToggleCategoryAll={noop}
                onClearAll={noop}
            />
        ));
        expect(getAllByRole('checkbox')[0]).toHaveAttribute('aria-checked', 'mixed');
        expect(container.textContent).toContain('1/20');
    });

    it('calls onClearAll', () => {
        const onClearAll = vi.fn();
        const { getByText } = render(() => (
            <PermissionPicker
                selected={emptySelection()}
                totalSelected={0}
                onTogglePermission={noop}
                onToggleCategoryAll={noop}
                onClearAll={onClearAll}
            />
        ));
        fireEvent.click(getByText('Clear all'));
        expect(onClearAll).toHaveBeenCalledTimes(1);
    });
});
