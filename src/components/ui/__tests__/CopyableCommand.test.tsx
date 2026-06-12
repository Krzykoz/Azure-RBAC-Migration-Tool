import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@solidjs/testing-library';
import { CopyableCommand } from '../CopyableCommand';

describe('CopyableCommand', () => {
    beforeEach(() => {
        Object.assign(navigator, {
            clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
        });
    });

    it('renders the command text', () => {
        const { getByText } = render(() => (
            <CopyableCommand command="az login" commandId="c1" />
        ));
        expect(getByText('az login')).toBeInTheDocument();
    });

    it('copies the command on click and swaps to the copied glyph', async () => {
        const { container } = render(() => (
            <CopyableCommand command="az account show" commandId="c2" />
        ));
        expect(container.querySelector('.icon-pop')).toBeNull();

        fireEvent.click(container.firstChild as Element);

        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('az account show');
        await waitFor(() => expect(container.querySelector('.icon-pop')).not.toBeNull());
    });
});
