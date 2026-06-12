import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@solidjs/testing-library';
import { IdentityResultCard } from '../IdentityResultCard';
import { makePolicy } from '../../test/factories';
import { MigrationAnalysis, SuggestedRole, ExistingCoverageResult } from '../../types';

const rec = (strategy: string, confidence: number): SuggestedRole => ({
    strategy,
    roleName: 'Combined Role',
    roleNames: ['Key Vault Reader'],
    confidence,
    reasoning: `reason for ${strategy}`,
    coveredPermissions: [],
    missingPermissions: [],
    excessPermissions: [],
    roleBreakdown: [],
});

const baseRes = (overrides: Partial<MigrationAnalysis> = {}): MigrationAnalysis => ({
    originalPolicy: makePolicy({ secrets: ['Get'] }, { objectId: 'obj-1', type: 'User' }),
    recommendations: [rec('Balanced', 90), rec('Max Coverage', 70)],
    ...overrides,
});

const props = (res: MigrationAnalysis, overrides: Record<string, unknown> = {}) => ({
    res,
    resolvedNames: {},
    selectedRoleIdx: 0,
    onSelectRole: vi.fn(),
    isSelected: false,
    onToggleSelection: vi.fn(),
    showSuggestions: false,
    onToggleSuggestions: vi.fn(),
    showCoverageDetails: false,
    onToggleCoverageDetails: vi.fn(),
    showPolicyDetails: false,
    onTogglePolicyDetails: vi.fn(),
    ...overrides,
});

describe('IdentityResultCard', () => {
    it('shows the raw object id and Resolution Failed for an unresolved identity', () => {
        const { getByText } = render(() => <IdentityResultCard {...props(baseRes())} />);
        expect(getByText('obj-1')).toBeInTheDocument();
        expect(getByText('Resolution Failed')).toBeInTheDocument();
    });

    it('shows the resolved display name when known', () => {
        const { getByText } = render(() => (
            <IdentityResultCard
                {...props(baseRes(), { resolvedNames: { 'obj-1': { name: 'Alice', type: 'User' } } })}
            />
        ));
        expect(getByText('Alice')).toBeInTheDocument();
    });

    it('renders strategy tabs and forwards selection', () => {
        const onSelectRole = vi.fn();
        const { getByText, container } = render(() => (
            <IdentityResultCard {...props(baseRes(), { onSelectRole })} />
        ));
        expect(getByText('Balanced')).toBeInTheDocument();
        fireEvent.click(getByText('Max Coverage'));
        expect(onSelectRole).toHaveBeenCalledWith(1);
        expect(getByText('Key Vault Reader')).toBeInTheDocument();
        expect(container.textContent).toContain('90%'); // confidence of the selected (idx 0) rec
    });

    it('toggles the export selection checkbox', () => {
        const onToggleSelection = vi.fn();
        const { getAllByRole } = render(() => (
            <IdentityResultCard {...props(baseRes(), { onToggleSelection })} />
        ));
        fireEvent.click(getAllByRole('checkbox')[0]);
        expect(onToggleSelection).toHaveBeenCalledTimes(1);
    });

    it('reveals the legacy policy permissions on toggle', () => {
        const onTogglePolicyDetails = vi.fn();
        const closed = render(() => (
            <IdentityResultCard {...props(baseRes(), { onTogglePolicyDetails })} />
        ));
        fireEvent.click(closed.getByText('View Legacy Policy'));
        expect(onTogglePolicyDetails).toHaveBeenCalled();

        const open = render(() => <IdentityResultCard {...props(baseRes(), { showPolicyDetails: true })} />);
        expect(open.getByText('Hide Legacy Policy')).toBeInTheDocument();
        expect(open.getByText('Get')).toBeInTheDocument();
    });

    it('shows the App ID for a compound identity', () => {
        const compound = baseRes({
            originalPolicy: makePolicy(
                { secrets: ['Get'] },
                { objectId: 'sp-1', applicationId: 'app-1', type: 'ServicePrincipal' }
            ),
        });
        const { container } = render(() => <IdentityResultCard {...props(compound)} />);
        expect(container.textContent).toContain('App ID: app-1');
    });

    it('hides recommendations and disables tabs when already fully covered', () => {
        const coverage: ExistingCoverageResult = {
            isFullyCovered: true,
            coveredPermissions: ['x'],
            missingPermissions: [],
            excessPermissions: [],
            roleMatches: [{ roleName: 'Key Vault Reader', covered: ['x'], excess: [] }],
        };
        const res = baseRes({ existingCoverage: coverage });
        const { getByText } = render(() => (
            <IdentityResultCard
                {...props(res, { resolvedNames: { 'obj-1': { name: 'Alice', type: 'User' } } })}
            />
        ));
        expect(getByText('Fully Covered via RBAC')).toBeInTheDocument();
        expect(getByText('Already Covered')).toBeInTheDocument();
        expect((getByText('Balanced') as HTMLButtonElement).disabled).toBe(true);
    });
});
