import { describe, expect, it } from 'vitest';
import { resolveProductPrice } from './resolvePrice';

const lists = [
  { id: 1, code: 'retail', is_default: true, active: true },
  { id: 2, code: 'wholesale', is_default: false, active: true },
];

describe('resolveProductPrice', () => {
  it('uses base when no lists match', () => {
    const r = resolveProductPrice({
      productId: 1,
      basePrice: 100,
      priceLists: [],
      productPrices: [],
    });
    expect(r.price).toBe(100);
    expect(r.source).toBe('base');
  });

  it('prefers customer override', () => {
    const r = resolveProductPrice({
      productId: 1,
      basePrice: 100,
      priceLists: lists,
      productPrices: [{ product_id: 1, price_list_id: 1, price: 90 }],
      customerOverrides: [{ product_id: 1, customer_id: 5, price: 70 }],
      customerId: 5,
    });
    expect(r.price).toBe(70);
    expect(r.source).toBe('customer');
  });

  it('uses wholesale list', () => {
    const r = resolveProductPrice({
      productId: 1,
      basePrice: 100,
      priceLists: lists,
      productPrices: [
        { product_id: 1, price_list_id: 1, price: 100 },
        { product_id: 1, price_list_id: 2, price: 80 },
      ],
      priceListCode: 'wholesale',
    });
    expect(r.price).toBe(80);
    expect(r.source).toBe('list:wholesale');
  });
});
