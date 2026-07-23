/**
 * BL-04: cumulative partial-refund guard.
 *
 * The refund endpoint previously compared each requested quantity against the
 * ORIGINAL sold quantity only, ignoring what had already been refunded. Two
 * partial refunds of 3 against a sale of 5 both passed, over-refunding cash and
 * over-restocking inventory. This validates each request line against the
 * REMAINING refundable quantity (sold − already refunded − earlier lines in the
 * same request).
 *
 * @param {Record<string|number, number>} soldByItemId   sale_item_id -> sold qty
 * @param {Record<string|number, number>} priorByItemId  sale_item_id -> already refunded qty
 * @param {Array<{ saleItemId: string|number, quantity: number }>} requestLines
 * @returns {{ ok: true } | { ok: false, saleItemId?: string|number, error: string, remaining?: number }}
 */
export function validateRefundQuantities(soldByItemId, priorByItemId, requestLines) {
  const inBatch = {};
  for (const line of requestLines) {
    const id = line.saleItemId;
    const qty = Number(line.quantity || 0);
    if (!(qty > 0)) return { ok: false, saleItemId: id, error: 'invalid_quantity' };
    const sold = Number(soldByItemId[id] || 0);
    const already = Number(priorByItemId[id] || 0) + Number(inBatch[id] || 0);
    const remaining = sold - already;
    if (qty > remaining) {
      return { ok: false, saleItemId: id, error: 'exceeds_remaining', remaining };
    }
    inBatch[id] = (inBatch[id] || 0) + qty;
  }
  return { ok: true };
}
