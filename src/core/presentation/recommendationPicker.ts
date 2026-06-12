import { SuggestedRole } from '../types';

/**
 * Picks the recommendation to highlight: best coverage, then least excess.
 * Returns the index of the best candidate, or -1 when none grant any role.
 */
export const pickRecommendedIndex = (recs: SuggestedRole[]): number => {
  let best = -1;
  recs.forEach((r, i) => {
    if (r.roleNames.length === 0) return;
    if (best === -1) {
      best = i;
      return;
    }
    const b = recs[best];
    if (
      r.confidence > b.confidence ||
      (r.confidence === b.confidence &&
        r.excessPermissions.length < b.excessPermissions.length)
    ) {
      best = i;
    }
  });
  return best;
};
