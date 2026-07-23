/**
 * BL-08: server-enforced discount ceiling by role.
 *
 * The sale endpoint accepted whatever `discount` the client sent, so a cashier
 * could apply an unlimited manual discount with no authorisation — a fraud/leak
 * vector. Cashiers are now capped at a percentage of the subtotal; manager and
 * owner (and superadmin) are uncapped. Over-cap sales are rejected server-side
 * and recorded in the audit log.
 *
 * Roles absent from the map are uncapped (null). Only sales-capable roles matter
 * here — cashier is the constrained one.
 */
export const DISCOUNT_CAP_BY_ROLE = Object.freeze({
  cashier: 0.1, // ≤ 10% of subtotal
});

/** Maximum discount amount allowed for a role on a given subtotal, or null = uncapped. */
export function maxDiscountAmount(role, subtotal) {
  const pct = DISCOUNT_CAP_BY_ROLE[role];
  if (pct == null) return null;
  return Math.max(0, Number(subtotal || 0) * pct);
}

/**
 * @returns {{ ok: true } | { ok: false, cap: number }}
 */
export function checkDiscountAllowed(role, subtotal, discount) {
  const cap = maxDiscountAmount(role, subtotal);
  if (cap == null) return { ok: true };
  // Tolerate floating-point rounding at the boundary.
  if (Number(discount || 0) > cap + 0.001) return { ok: false, cap };
  return { ok: true };
}
