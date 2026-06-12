import { describe, it, expect } from 'vitest';
import { createSignal } from 'solid-js';
import { render, fireEvent } from '@solidjs/testing-library';
import { AnalysisResults } from '../AnalysisResults';
import { makePolicy } from '../../test/factories';
import { MigrationAnalysis, SuggestedRole } from '../../types';

const rec = (): SuggestedRole => ({
    strategy: 'Balanced',
    roleName: 'Combined',
    roleNames: ['Key Vault Reader'],
    confidence: 90,
    reasoning: 'r',
    coveredPermissions: ['x'],
    missingPermissions: [],
    excessPermissions: [],
    roleBreakdown: [],
});

const results: MigrationAnalysis[] = [
    {
        originalPolicy: makePolicy({ secrets: ['Get'] }, { objectId: 'u1', type: 'User', displayName: 'Alice' }),
        recommendations: [rec()],
    },
    {
        originalPolicy: makePolicy({ secrets: ['Get'] }, { objectId: 'x9', type: 'Unknown' }),
        recommendations: [rec()],
    },
];

// Harness owns the selection signals so we can observe reactive selection updates.
const Harness = () => {
    const [selForExport, setSelForExport] = createSignal<Set<string>>(new Set());
    const [selRoles, setSelRoles] = createSignal<Record<string, number>>({});
    return (
        <AnalysisResults
            results={results}
            selectedRoles={selRoles()}
            setSelectedRoles={setSelRoles}
            resolvedNames={{}}
            theme="light"
            selectedForExport={selForExport()}
            setSelectedForExport={setSelForExport}
        />
    );
};

describe('AnalysisResults', () => {
    it('renders the chart, headings, and grouped identities', () => {
        const { getByText, container } = render(() => <Harness />);
        expect(container.querySelector('svg[aria-label="Coverage distribution chart"]')).not.toBeNull();
        expect(getByText('Identity Mapping')).toBeInTheDocument();
        expect(container.textContent).toContain('Users');
        expect(container.textContent).toContain('Unknown Identities');
        expect(container.textContent).toContain('Alice');
        expect(container.textContent).toContain('x9');
    });

    it('select-all toggles every identity row', () => {
        const { getAllByRole } = render(() => <Harness />);
        const checkboxes = () => getAllByRole('checkbox');
        // [0] select-all, [1] Users group, [2] Alice row, [3] Unknown group, [4] x9 row
        expect(checkboxes()[2]).toHaveAttribute('aria-checked', 'false');

        fireEvent.click(checkboxes()[0]);
        expect(checkboxes()[2]).toHaveAttribute('aria-checked', 'true');
        expect(checkboxes()[4]).toHaveAttribute('aria-checked', 'true');
    });

    it('toggling a category selects just that group', () => {
        const { getAllByRole } = render(() => <Harness />);
        const checkboxes = () => getAllByRole('checkbox');
        fireEvent.click(checkboxes()[1]); // Users group header
        expect(checkboxes()[2]).toHaveAttribute('aria-checked', 'true'); // Alice
        expect(checkboxes()[4]).toHaveAttribute('aria-checked', 'false'); // x9 untouched
    });
});
