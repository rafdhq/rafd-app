import { describe, expect, it } from 'vitest';
import { checkDiscountAllowed, maxDiscountAmount } from './_lib/discount-policy.js';

describe('discount policy (BL-08 role cap)', () => {
  it('caps cashier at 10% of subtotal', () => {
    expect(maxDiscountAmount('cashier', 1000)).toBe(100);
    expect(checkDiscountAllowed('cashier', 1000, 100).ok).toBe(true);
    const over = checkDiscountAllowed('cashier', 1000, 150);
    expect(over.ok).toBe(false);
    expect(over.cap).toBe(100);
  });

  it('leaves manager, owner and superadmin uncapped', () => {
    for (const role of ['manager', 'owner', 'superadmin']) {
      expect(maxDiscountAmount(role, 1000)).toBeNull();
      expect(checkDiscountAllowed(role, 1000, 999).ok).toBe(true);
    }
  });

  it('tolerates rounding at the boundary', () => {
    expect(checkDiscountAllowed('cashier', 333.33, 33.333).ok).toBe(true);
  });

  it('treats a zero/absent discount as allowed for anyone', () => {
    expect(checkDiscountAllowed('cashier', 1000, 0).ok).toBe(true);
    expect(checkDiscountAllowed('cashier', 0, 0).ok).toBe(true);
  });
});
