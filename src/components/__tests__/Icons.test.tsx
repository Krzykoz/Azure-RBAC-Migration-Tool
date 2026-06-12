import { describe, it, expect } from 'vitest';
import { render } from '@solidjs/testing-library';
import { KeyVaultIcon, DownloadIcon, AlertTriangleIcon } from '../Icons';

describe('Icons', () => {
    it('renders an svg and forwards the class prop', () => {
        const { container } = render(() => <KeyVaultIcon class="w-4 h-4 text-brand-600" />);
        const svg = container.querySelector('svg');
        expect(svg).not.toBeNull();
        expect(svg?.getAttribute('class')).toContain('w-4');
        expect(svg?.getAttribute('viewBox')).toBe('0 0 24 24');
    });

    it('renders distinct icon geometry', () => {
        const download = render(() => <DownloadIcon />);
        expect(download.container.querySelector('polyline')).not.toBeNull();

        const alert = render(() => <AlertTriangleIcon />);
        expect(alert.container.querySelector('path')).not.toBeNull();
    });
});
