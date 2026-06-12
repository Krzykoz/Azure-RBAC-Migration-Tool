import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@solidjs/testing-library';
import { PermissionVisualizer } from '../PermissionVisualizer';
import { RoleBreakdown } from '../../types';

describe('PermissionVisualizer', () => {
    it('renders the missing section with a Show All toggle past the visible limit', () => {
        const missing = Array.from(
            { length: 8 },
            (_, i) => `Microsoft.KeyVault/vaults/secrets/op${i}/action`
        );
        const { getByText, container } = render(() => (
            <PermissionVisualizer breakdown={[]} missing={missing} />
        ));
        expect(getByText('Missing Permissions')).toBeInTheDocument();
        expect(getByText('Show All')).toBeInTheDocument();
        expect(container.textContent).toContain('+2 more...');

        fireEvent.click(getByText('Show All'));
        expect(getByText('Show Less')).toBeInTheDocument();
        expect(container.textContent).not.toContain('more...');
    });

    it('omits the missing section when there are no missing permissions', () => {
        const { queryByText } = render(() => <PermissionVisualizer breakdown={[]} missing={[]} />);
        expect(queryByText('Missing Permissions')).toBeNull();
    });

    it('renders a role breakdown with covered and excess permissions', () => {
        const breakdown: RoleBreakdown[] = [
            {
                roleName: 'Key Vault Reader',
                covered: ['Microsoft.KeyVault/vaults/secrets/getSecret/action'],
                excess: ['Microsoft.KeyVault/vaults/secrets/purge/action'],
            },
        ];
        const { getByText, container } = render(() => (
            <PermissionVisualizer breakdown={breakdown} missing={[]} />
        ));
        expect(getByText('Key Vault Reader')).toBeInTheDocument();
        // Both a covered and an excess badge are rendered.
        const badges = container.querySelectorAll('span.border.truncate');
        expect(badges.length).toBeGreaterThanOrEqual(2);
    });

    it('does not show a role toggle when nothing overflows', () => {
        const breakdown: RoleBreakdown[] = [
            { roleName: 'Tiny Role', covered: ['a', 'b'], excess: [] },
        ];
        const { queryByText } = render(() => (
            <PermissionVisualizer breakdown={breakdown} missing={[]} />
        ));
        expect(queryByText('Show All')).toBeNull();
    });
});
