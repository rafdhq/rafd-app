import { describe, expect, it } from 'vitest';
import { saleItemStockDelta } from './stockDelta';

describe('saleItemStockDelta (BL-09 weight unit)', () => {
  it('deducts the piece count for non-weight items', () => {
    expect(saleItemStockDelta({ quantity: 3 })).toBe(3);
  });

  it('deducts kilograms for weight items (grams / 1000), never grams', () => {
    // 500 g must reduce a kg-based stock by 0.5 kg — the old code subtracted 500.
    expect(saleItemStockDelta({ quantity: 0.5, weight_g: 500, sold_by_weight: true })).toBe(0.5);
    expect(saleItemStockDelta({ weight_g: 1500, sold_by_weight: true })).toBe(1.5);
  });

  it('treats a present weight_g as a weight item even without the flag', () => {
    expect(saleItemStockDelta({ quantity: 2, weight_g: 250 })).toBe(0.25);
  });

  it('never returns a negative delta', () => {
    expect(saleItemStockDelta({ quantity: -5 })).toBe(0);
    expect(saleItemStockDelta({})).toBe(0);
  });
});
