import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@solidjs/testing-library';
import { CoverageBanner } from '../CoverageBanner';
import { ExistingCoverageResult } from '../../types';

const full: ExistingCoverageResult = {
    isFullyCovered: true,
    coveredPermissions: ['x'],
    missingPermissions: [],
    excessPermissions: [],
    roleMatches: [{ roleName: 'Key Vault Reader', covered: ['x'], excess: [] }],
};
const partial: ExistingCoverageResult = {
    isFullyCovered: false,
    coveredPermissions: ['x'],
    missingPermissions: ['y'],
    excessPermissions: [],
    roleMatches: [{ roleName: 'Key Vault Reader', covered: ['x'], excess: [] }],
};
const none: ExistingCoverageResult = {
    isFullyCovered: false,
    coveredPermissions: [],
    missingPermissions: ['y'],
    excessPermissions: [],
    roleMatches: [],
};

describe('CoverageBanner', () => {
    it('renders nothing when there is no coverage match', () => {
        const { container } = render(() => (
            <CoverageBanner existingCoverage={none} objectId="k" showDetails={false} onToggleDetails={() => {}} />
        ));
        expect(container.textContent).toBe('');
    });

    it('renders the green Fully Covered banner with a suggestions toggle', () => {
        const onToggleDetails = vi.fn();
        const { getByText } = render(() => (
            <CoverageBanner
                existingCoverage={full}
                objectId="k"
                showDetails={false}
                onToggleDetails={onToggleDetails}
                onToggleSuggestions={() => {}}
            />
        ));
        expect(getByText('Fully Covered via RBAC')).toBeInTheDocument();
        expect(getByText('Show Suggested Roles')).toBeInTheDocument();
        fireEvent.click(getByText('Show Details'));
        expect(onToggleDetails).toHaveBeenCalledWith('k');
    });

    it('shows the existing-roles visualizer when details are open', () => {
        const { getByText } = render(() => (
            <CoverageBanner existingCoverage={full} objectId="k" showDetails={true} onToggleDetails={() => {}} />
        ));
        expect(getByText('Existing Roles Coverage')).toBeInTheDocument();
        expect(getByText('Hide Details')).toBeInTheDocument();
    });

    it('renders the blue Partially Covered banner', () => {
        const { getByText } = render(() => (
            <CoverageBanner existingCoverage={partial} objectId="k" showDetails={false} onToggleDetails={() => {}} />
        ));
        expect(getByText('Partially Covered')).toBeInTheDocument();
    });

    it('omits the suggestions toggle when no handler is provided', () => {
        const { queryByText } = render(() => (
            <CoverageBanner existingCoverage={full} objectId="k" showDetails={false} onToggleDetails={() => {}} />
        ));
        expect(queryByText('Show Suggested Roles')).toBeNull();
    });
});
