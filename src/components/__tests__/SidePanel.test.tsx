import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@solidjs/testing-library';
import { SidePanel } from '../SidePanel';
import { Subscription, KeyVault } from '../../types';

const subs: Subscription[] = [
    { id: 's1', displayName: 'Production', subscriptionId: 'sub-prod' },
    { id: 's2', displayName: 'Dev', subscriptionId: 'sub-dev' },
];
const vaults: KeyVault[] = [
    { id: 'v1', name: 'kv-one', location: 'westus', sku: 'standard', accessPolicies: [] },
];
const noop = () => {};

describe('SidePanel', () => {
    it('lists subscriptions and forwards selection', () => {
        const onSelectSub = vi.fn();
        const { getByText } = render(() => (
            <SidePanel
                subscriptions={subs}
                selectedSub={null}
                onSelectSub={onSelectSub}
                vaults={[]}
                selectedVault={null}
                onSelectVault={noop}
                isLoading={false}
            />
        ));
        expect(getByText('Production')).toBeInTheDocument();
        expect(getByText('Dev')).toBeInTheDocument();
        fireEvent.click(getByText('Production'));
        expect(onSelectSub).toHaveBeenCalledWith(subs[0]);
    });

    it('filters subscriptions live', () => {
        const { getByPlaceholderText, getByText, queryByText } = render(() => (
            <SidePanel
                subscriptions={subs}
                selectedSub={null}
                onSelectSub={noop}
                vaults={[]}
                selectedVault={null}
                onSelectVault={noop}
                isLoading={false}
            />
        ));
        fireEvent.input(getByPlaceholderText('Filter subscriptions...'), {
            target: { value: 'prod' },
        });
        expect(getByText('Production')).toBeInTheDocument();
        expect(queryByText('Dev')).toBeNull();
    });

    it('hides the vault card until a subscription is selected', () => {
        const { queryByText } = render(() => (
            <SidePanel
                subscriptions={subs}
                selectedSub={null}
                onSelectSub={noop}
                vaults={vaults}
                selectedVault={null}
                onSelectVault={noop}
                isLoading={false}
            />
        ));
        expect(queryByText('Key Vaults')).toBeNull();
    });

    it('shows vaults once a subscription is selected and forwards selection', () => {
        const onSelectVault = vi.fn();
        const { getByText } = render(() => (
            <SidePanel
                subscriptions={subs}
                selectedSub={subs[0]}
                onSelectSub={noop}
                vaults={vaults}
                selectedVault={null}
                onSelectVault={onSelectVault}
                isLoading={false}
            />
        ));
        expect(getByText('Key Vaults')).toBeInTheDocument();
        fireEvent.click(getByText('kv-one'));
        expect(onSelectVault).toHaveBeenCalledWith(vaults[0]);
    });

    it('shows an empty state when no subscriptions match', () => {
        const { getByText } = render(() => (
            <SidePanel
                subscriptions={[]}
                selectedSub={null}
                onSelectSub={noop}
                vaults={[]}
                selectedVault={null}
                onSelectVault={noop}
                isLoading={false}
            />
        ));
        expect(getByText('No subscriptions found.')).toBeInTheDocument();
    });
});
