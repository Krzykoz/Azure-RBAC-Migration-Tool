import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@solidjs/testing-library';
import { Header } from '../Header';

describe('Header', () => {
    it('shows the brand and no user block when signed out', () => {
        const { getByText, queryByTitle } = render(() => (
            <Header user={null} onLogout={() => {}} theme="light" onToggleTheme={() => {}} />
        ));
        expect(getByText('Key Vault Migrator')).toBeInTheDocument();
        expect(getByText('RBAC Assistant')).toBeInTheDocument();
        expect(queryByTitle('Sign out')).toBeNull();
    });

    it('shows the user, organization, and avatar initial when signed in', () => {
        const { getByText, getByTitle } = render(() => (
            <Header
                user="alice@contoso.com"
                organization="Contoso"
                onLogout={() => {}}
                theme="light"
                onToggleTheme={() => {}}
            />
        ));
        expect(getByText('alice@contoso.com')).toBeInTheDocument();
        expect(getByText('Contoso')).toBeInTheDocument();
        expect(getByTitle('Sign out').textContent).toBe('A');
    });

    it('omits the organization line when none is provided', () => {
        const { getByTitle, queryByText } = render(() => (
            <Header user="bob" onLogout={() => {}} theme="light" onToggleTheme={() => {}} />
        ));
        expect(getByTitle('Sign out').textContent).toBe('B');
        expect(queryByText('Contoso')).toBeNull();
    });

    it('calls onLogout when the avatar is clicked', () => {
        const onLogout = vi.fn();
        const { getByTitle } = render(() => (
            <Header user="bob" onLogout={onLogout} theme="light" onToggleTheme={() => {}} />
        ));
        fireEvent.click(getByTitle('Sign out'));
        expect(onLogout).toHaveBeenCalledTimes(1);
    });

    it('labels the theme toggle with the next mode and calls onToggleTheme', () => {
        const onToggleTheme = vi.fn();
        const light = render(() => (
            <Header user={null} onLogout={() => {}} theme="light" onToggleTheme={onToggleTheme} />
        ));
        fireEvent.click(light.getByTitle('Switch to dark mode'));
        expect(onToggleTheme).toHaveBeenCalledTimes(1);

        const dark = render(() => (
            <Header user={null} onLogout={() => {}} theme="dark" onToggleTheme={() => {}} />
        ));
        expect(dark.getByTitle('Switch to light mode')).toBeInTheDocument();
    });
});
