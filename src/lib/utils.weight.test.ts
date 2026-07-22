import { describe, expect, it } from 'vitest';
import { formatWeightLabel, isWeightProduct, lineAmount } from './utils';

describe('weight POS helpers', () => {
  it('detects vegetable category as weight product', () => {
    expect(isWeightProduct({ category: 'خضار', unit: 'كجم' })).toBe(true);
    expect(isWeightProduct({ category: 'بقالة', unit: 'حبة' })).toBe(false);
  });

  it('computes line amount from grams and price per kg', () => {
    const total = lineAmount({
      product: { price: 1000 },
      quantity: 0.5,
      weight_g: 500,
      sold_by_weight: true,
      discount: 0,
    });
    expect(total).toBe(500);
  });

  it('formats weight labels', () => {
    expect(formatWeightLabel(500)).toContain('غرام');
    expect(formatWeightLabel(1500)).toContain('كجم');
  });
});
