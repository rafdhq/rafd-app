import { describe, expect, it } from 'vitest';
import { canUseOffer, earnPoints, pointsForDiscount, redeemValue, resolveTier } from './engine';

describe('loyalty engine', () => {
  it('earns and redeems points', () => {
    expect(earnPoints(250, { points_per_currency: 1 })).toBe(250);
    expect(redeemValue(500, { redemption_rate: 100 })).toBe(5);
    expect(pointsForDiscount(10, { redemption_rate: 100 })).toBe(1000);
  });

  it('resolves tiers', () => {
    expect(resolveTier(0)).toBe('bronze');
    expect(resolveTier(600)).toBe('silver');
    expect(resolveTier(2500)).toBe('gold');
    expect(resolveTier(9000)).toBe('platinum');
  });

  it('checks offer eligibility by tier', () => {
    expect(canUseOffer('gold', 'silver')).toBe(true);
    expect(canUseOffer('bronze', 'gold')).toBe(false);
  });
});
