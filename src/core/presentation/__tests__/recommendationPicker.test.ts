import { describe, it, expect } from 'vitest';
import { pickRecommendedIndex } from '../recommendationPicker';
import { SuggestedRole } from '../../types';

const rec = (over: Partial<SuggestedRole> = {}): SuggestedRole => ({
    strategy: 'Balanced',
    roleName: 'Role',
    roleNames: ['Role'],
    confidence: 0,
    reasoning: '',
    coveredPermissions: [],
    missingPermissions: [],
    excessPermissions: [],
    roleBreakdown: [],
    ...over,
});

describe('pickRecommendedIndex', () => {
    it('returns -1 when no recommendation grants a role', () => {
        expect(pickRecommendedIndex([])).toBe(-1);
        expect(pickRecommendedIndex([rec({ roleNames: [] })])).toBe(-1);
    });

    it('skips empty-role candidates and picks the first eligible one', () => {
        const recs = [rec({ roleNames: [] }), rec({ confidence: 50 })];
        expect(pickRecommendedIndex(recs)).toBe(1);
    });

    it('prefers the highest confidence', () => {
        const recs = [rec({ confidence: 40 }), rec({ confidence: 90 }), rec({ confidence: 60 })];
        expect(pickRecommendedIndex(recs)).toBe(1);
    });

    it('breaks confidence ties by least excess', () => {
        const recs = [
            rec({ confidence: 80, excessPermissions: ['a', 'b'] }),
            rec({ confidence: 80, excessPermissions: ['a'] }),
        ];
        expect(pickRecommendedIndex(recs)).toBe(1);
    });

    it('keeps the earlier candidate when confidence and excess are equal', () => {
        const recs = [
            rec({ confidence: 80, excessPermissions: ['a'] }),
            rec({ confidence: 80, excessPermissions: ['b'] }),
        ];
        expect(pickRecommendedIndex(recs)).toBe(0);
    });
});
