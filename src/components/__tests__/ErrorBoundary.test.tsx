import { describe, it, expect, vi } from 'vitest';
import { render } from '@solidjs/testing-library';
import { ErrorBoundary } from '../ErrorBoundary';

describe('ErrorBoundary', () => {
    it('renders children when nothing throws', () => {
        const { getByText } = render(() => (
            <ErrorBoundary>
                <div>safe content</div>
            </ErrorBoundary>
        ));
        expect(getByText('safe content')).toBeInTheDocument();
    });

    it('renders the fallback with the error message when a child throws', () => {
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const Boom = () => {
            throw new Error('kaboom');
        };
        const { getByText, getByRole } = render(() => (
            <ErrorBoundary>
                <Boom />
            </ErrorBoundary>
        ));
        expect(getByText('Something went wrong')).toBeInTheDocument();
        expect(getByText('kaboom')).toBeInTheDocument();
        expect(getByRole('button', { name: 'Reload Page' })).toBeInTheDocument();
        errSpy.mockRestore();
    });
});
