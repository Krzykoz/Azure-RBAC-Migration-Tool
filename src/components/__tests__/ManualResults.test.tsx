import { describe, it, expect } from 'vitest';
import { render } from '@solidjs/testing-library';
import { ManualResults, EmptyHint } from '../ManualResults';
import { SuggestedRole, MigrationAnalysis } from '../../types';

const rec = (overrides: Partial<SuggestedRole> = {}): SuggestedRole => ({
    strategy: 'Balanced',
    roleName: '',
    roleNames: ['Key Vault Reader'],
    confidence: 90,
    reasoning: '',
    coveredPermissions: [],
    missingPermissions: [],
    excessPermissions: [],
    roleBreakdown: [],
    ...overrides,
});

const result = (recommendations: SuggestedRole[]): MigrationAnalysis => ({
    originalPolicy: { tenantId: '', objectId: 'manual-selection', type: 'Unknown', permissions: {} },
    recommendations,
});

describe('ManualResults', () => {
    it('renders an empty hint', () => {
        const { getByText } = render(() => <EmptyHint text="pick something" />);
        expect(getByText('pick something')).toBeInTheDocument();
    });

    it('shows the no-match banner when no recommendation grants a role', () => {
        const { getByText } = render(() => (
            <ManualResults result={result([rec({ roleNames: [] })])} />
        ));
        expect(getByText(/No matching roles were found/)).toBeInTheDocument();
    });

    it('renders cards, metrics, the Recommended badge, and hides zero-role recs', () => {
        const { getByText, queryByText } = render(() => (
            <ManualResults
                result={result([
                    rec({ strategy: 'Balanced', roleNames: ['Key Vault Reader'], confidence: 90 }),
                    rec({ strategy: 'EmptyStrat', roleNames: [], confidence: 10 }),
                ])}
            />
        ));
        expect(getByText('Key Vault Reader')).toBeInTheDocument();
        expect(getByText('Coverage')).toBeInTheDocument();
        expect(getByText('Excess')).toBeInTheDocument();
        expect(getByText('Missing')).toBeInTheDocument();
        expect(getByText('Recommended')).toBeInTheDocument();
        // The zero-role recommendation is not rendered.
        expect(queryByText('EmptyStrat')).toBeNull();
    });

    it('joins combined role names with " + "', () => {
        const { getByText } = render(() => (
            <ManualResults result={result([rec({ roleNames: ['Reader', 'Crypto User'] })])} />
        ));
        expect(getByText('Reader + Crypto User')).toBeInTheDocument();
    });
});
