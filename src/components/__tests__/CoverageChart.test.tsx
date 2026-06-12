import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@solidjs/testing-library';
import { CoverageChart } from '../CoverageChart';
import { CoverageChartDatum } from '../../utils/identityGrouping';

const data: CoverageChartDatum[] = [
    {
        name: 'Alice',
        coveragePct: 90,
        excessPct: 10,
        missingPct: 0,
        fullScale: 100,
        rawMissing: 0,
        rawExcess: 2,
        role: 'Key Vault Reader',
        strategy: 'Balanced',
    },
    {
        name: 'Bob',
        coveragePct: 50,
        excessPct: 0,
        missingPct: 50,
        fullScale: 100,
        rawMissing: 5,
        rawExcess: 0,
        role: 'None',
        strategy: 'Max Coverage',
    },
];

describe('CoverageChart', () => {
    it('renders the chart with one bar per active segment', () => {
        const { container, getByText } = render(() => <CoverageChart data={data} theme="light" />);
        expect(getByText('Coverage Distribution')).toBeInTheDocument();
        expect(container.querySelector('svg[aria-label="Coverage distribution chart"]')).not.toBeNull();
        // Coverage bars for both rows; excess for Alice only; missing for Bob only.
        expect(container.querySelectorAll('rect[fill="#107c10"]').length).toBe(2);
        expect(container.querySelectorAll('rect[fill="#ffaa44"]').length).toBe(1);
        expect(container.querySelectorAll('rect[fill="#d13438"]').length).toBe(1);
        // Five Y gridlines.
        expect(container.querySelectorAll('line').length).toBe(5);
    });

    it('renders the summary stat cards', () => {
        const { container, getByText } = render(() => <CoverageChart data={data} theme="light" />);
        const values = container.querySelectorAll('.text-3xl');
        expect(values[0].textContent).toBe('70%'); // average coverage
        expect(values[1].textContent).toBe('5'); // total missing
        expect(values[2].textContent).toBe('2'); // total excess
        expect(getByText('Average Coverage')).toBeInTheDocument();
        expect(getByText('Total Missing Permissions')).toBeInTheDocument();
        expect(getByText('Total Excess Permissions')).toBeInTheDocument();
    });

    it('shows a tooltip with strategy, role, and coverage on hover', () => {
        const { container, getByText, queryByText } = render(() => (
            <CoverageChart data={data} theme="light" />
        ));
        const hoverTargets = container.querySelectorAll('rect[fill="transparent"]');
        expect(hoverTargets.length).toBe(2);

        fireEvent.mouseEnter(hoverTargets[0]);
        expect(getByText('Key Vault Reader')).toBeInTheDocument();
        expect(getByText('Balanced')).toBeInTheDocument();

        fireEvent.mouseLeave(hoverTargets[0]);
        expect(queryByText('Key Vault Reader')).toBeNull();
    });

    it('handles an empty dataset without dividing by zero', () => {
        const { container } = render(() => <CoverageChart data={[]} theme="light" />);
        expect(container.querySelectorAll('.text-3xl')[0].textContent).toBe('0%');
    });
});
