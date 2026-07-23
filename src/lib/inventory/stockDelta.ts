/**
 * Stock quantity to deduct for one sold line.
 *
 * BL-09: weight products are tracked in kilograms (price is per-kg; the POS
 * captures grams and sends `quantity` already converted to kg). The deduction
 * must therefore always be in kg for weight items — never grams — regardless of
 * any free-text unit on the product. Piece items deduct their integer count.
 */
export function saleItemStockDelta(item: {
  quantity?: number;
  weight_g?: number | null;
  sold_by_weight?: boolean;
}): number {
  let dec = Number(item.quantity) || 0;
  if ((item.sold_by_weight || item.weight_g != null) && item.weight_g != null) {
    dec = Number(item.weight_g) / 1000;
  }
  return dec > 0 ? dec : 0;
}
