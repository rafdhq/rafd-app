import { describe, expect, it } from 'vitest';
import { validateRefundQuantities } from './_lib/refund-math.js';

/**
 * BL-04: refunds must not exceed the remaining refundable quantity
 * (sold − already refunded − earlier lines in the same request).
 */
describe('validateRefundQuantities (BL-04 cumulative refund guard)', () => {
  it('allows a partial refund within remaining qty', () => {
    const r = validateRefundQuantities({ 1: 5 }, { 1: 0 }, [{ saleItemId: 1, quantity: 3 }]);
    expect(r.ok).toBe(true);
  });

  it('blocks a second partial refund that exceeds remaining (3 + 3 of 5)', () => {
    // 3 already refunded, now requesting 3 more of a line sold as 5 → only 2 left.
    const r = validateRefundQuantities({ 1: 5 }, { 1: 3 }, [{ saleItemId: 1, quantity: 3 }]);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('exceeds_remaining');
    expect(r.remaining).toBe(2);
  });

  it('accounts for multiple lines of the same item within one request', () => {
    // Sold 5, nothing prior, but two lines of 3 in the same request → second fails.
    const r = validateRefundQuantities({ 1: 5 }, {}, [
      { saleItemId: 1, quantity: 3 },
      { saleItemId: 1, quantity: 3 },
    ]);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('exceeds_remaining');
    expect(r.remaining).toBe(2);
  });

  it('allows refunding exactly the remaining quantity', () => {
    const r = validateRefundQuantities({ 1: 5 }, { 1: 2 }, [{ saleItemId: 1, quantity: 3 }]);
    expect(r.ok).toBe(true);
  });

  it('rejects non-positive quantities', () => {
    expect(validateRefundQuantities({ 1: 5 }, {}, [{ saleItemId: 1, quantity: 0 }]).error).toBe(
      'invalid_quantity'
    );
    expect(validateRefundQuantities({ 1: 5 }, {}, [{ saleItemId: 1, quantity: -1 }]).error).toBe(
      'invalid_quantity'
    );
  });

  it('supports independent items in one refund', () => {
    const r = validateRefundQuantities({ 1: 5, 2: 4 }, { 1: 5, 2: 1 }, [
      { saleItemId: 2, quantity: 3 },
    ]);
    expect(r.ok).toBe(true); // item 1 fully refunded, item 2 has 3 remaining
  });
});
