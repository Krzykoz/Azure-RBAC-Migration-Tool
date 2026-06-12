import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@solidjs/testing-library';
import { RoleSourceSelector } from '../RoleSourceSelector';

const baseProps = (overrides: Record<string, unknown> = {}) => ({
    roleSource: 'builtin' as const,
    onSelectSource: vi.fn(),
    sourceStatus: '12 built-in roles loaded',
    pasteJson: '',
    onChangePasteJson: vi.fn(),
    pasteError: null,
    token: '',
    onChangeToken: vi.fn(),
    subscriptions: [],
    selectedSubId: '',
    onSelectSubscription: vi.fn(),
    loadingSubs: false,
    loadingRoles: false,
    tokenError: null,
    onLoadSubscriptions: vi.fn(),
    onLoadRoles: vi.fn(),
    ...overrides,
});

describe('RoleSourceSelector', () => {
    it('shows the status and marks the active source', () => {
        const { getByText } = render(() => <RoleSourceSelector {...baseProps()} />);
        expect(getByText('12 built-in roles loaded')).toBeInTheDocument();
        expect(getByText('Built-in (offline)')).toHaveAttribute('aria-pressed', 'true');
        expect(getByText('Paste JSON')).toHaveAttribute('aria-pressed', 'false');
    });

    it('selects a different source', () => {
        const onSelectSource = vi.fn();
        const { getByText } = render(() => <RoleSourceSelector {...baseProps({ onSelectSource })} />);
        fireEvent.click(getByText('Paste JSON'));
        expect(onSelectSource).toHaveBeenCalledWith('paste');
    });

    it('shows the paste panel, forwards edits, and renders the parse error', () => {
        const onChangePasteJson = vi.fn();
        const { getByPlaceholderText, getByText } = render(() => (
            <RoleSourceSelector
                {...baseProps({ roleSource: 'paste', pasteError: 'Invalid JSON.', onChangePasteJson })}
            />
        ));
        fireEvent.input(getByPlaceholderText(/Paste Role Definitions JSON/), {
            target: { value: '[]' },
        });
        expect(onChangePasteJson).toHaveBeenCalledWith('[]');
        expect(getByText('Invalid JSON.')).toBeInTheDocument();
    });

    it('drives the live-token flow: load subscriptions, then load roles', () => {
        const onLoadSubscriptions = vi.fn();
        const onLoadRoles = vi.fn();
        const subs = [{ id: 's1', displayName: 'Sub One', subscriptionId: 'sub-1' }];
        const { getByText } = render(() => (
            <RoleSourceSelector
                {...baseProps({
                    roleSource: 'token',
                    subscriptions: subs,
                    selectedSubId: 'sub-1',
                    onLoadSubscriptions,
                    onLoadRoles,
                })}
            />
        ));
        fireEvent.click(getByText('Load subscriptions'));
        expect(onLoadSubscriptions).toHaveBeenCalledTimes(1);
        expect(getByText('Sub One')).toBeInTheDocument();
        fireEvent.click(getByText('Load roles'));
        expect(onLoadRoles).toHaveBeenCalledTimes(1);
    });

    it('surfaces a token error', () => {
        const { getByText } = render(() => (
            <RoleSourceSelector
                {...baseProps({ roleSource: 'token', tokenError: 'Paste a Management token first.' })}
            />
        ));
        expect(getByText('Paste a Management token first.')).toBeInTheDocument();
    });
});
