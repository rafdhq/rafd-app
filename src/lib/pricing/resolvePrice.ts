export type PriceListCode = 'retail' | 'wholesale' | 'half_wholesale' | 'vip' | string;

export interface PriceList {
  id: number;
  code: string;
  name?: string;
  is_default?: boolean;
  active?: boolean;
}

export interface ProductPriceRow {
  product_id: number;
  price_list_id: number;
  price: number;
}

export interface PriceOverride {
  product_id: number;
  price: number;
  customer_id?: number;
  branch_id?: number;
  price_list_id?: number | null;
}

export interface ResolvePriceInput {
  productId: number;
  basePrice: number;
  priceLists: PriceList[];
  productPrices: ProductPriceRow[];
  customerOverrides?: PriceOverride[];
  branchOverrides?: PriceOverride[];
  priceListCode?: PriceListCode | null;
  priceListId?: number | null;
  customerId?: number | null;
  branchId?: number | null;
}

/**
 * Priority:
 * 1) customer-specific product override
 * 2) branch-specific product price
 * 3) branch price-list mapping for product
 * 4) selected price list
 * 5) default price list
 * 6) product.basePrice
 */
export function resolveProductPrice(input: ResolvePriceInput): {
  price: number;
  source: string;
  price_list_id: number | null;
} {
  const {
    productId,
    basePrice,
    priceLists,
    productPrices,
    customerOverrides = [],
    branchOverrides = [],
    priceListCode,
    priceListId,
    customerId,
    branchId,
  } = input;

  if (customerId) {
    const c = customerOverrides.find(
      (o) => Number(o.customer_id) === Number(customerId) && Number(o.product_id) === Number(productId)
    );
    if (c) return { price: Number(c.price), source: 'customer', price_list_id: null };
  }

  if (branchId) {
    const b = branchOverrides.find(
      (o) =>
        Number(o.branch_id) === Number(branchId) &&
        Number(o.product_id) === Number(productId) &&
        o.price != null
    );
    if (b && b.price != null) {
      return { price: Number(b.price), source: 'branch', price_list_id: b.price_list_id || null };
    }
  }

  let list: PriceList | undefined;
  if (priceListId) list = priceLists.find((l) => Number(l.id) === Number(priceListId) && l.active !== false);
  if (!list && priceListCode) {
    list = priceLists.find((l) => l.code === priceListCode && l.active !== false);
  }
  if (!list) list = priceLists.find((l) => l.is_default && l.active !== false) || priceLists.find((l) => l.active !== false);

  if (list) {
    if (branchId) {
      const bl = branchOverrides.find(
        (o) =>
          Number(o.branch_id) === Number(branchId) &&
          Number(o.product_id) === Number(productId) &&
          o.price_list_id != null
      );
      if (bl?.price_list_id) {
        const row = productPrices.find(
          (p) => Number(p.product_id) === Number(productId) && Number(p.price_list_id) === Number(bl.price_list_id)
        );
        if (row) return { price: Number(row.price), source: 'branch_list', price_list_id: Number(bl.price_list_id) };
      }
    }

    const row = productPrices.find(
      (p) => Number(p.product_id) === Number(productId) && Number(p.price_list_id) === Number(list!.id)
    );
    if (row) return { price: Number(row.price), source: `list:${list.code}`, price_list_id: list.id };
  }

  return { price: Number(basePrice || 0), source: 'base', price_list_id: list?.id ?? null };
}

export const PRICE_LIST_PRESETS: Array<{ code: PriceListCode; name_ar: string; name_en: string }> = [
  { code: 'retail', name_ar: 'قطاعي', name_en: 'Retail' },
  { code: 'half_wholesale', name_ar: 'نصف جملة', name_en: 'Half wholesale' },
  { code: 'wholesale', name_ar: 'جملة', name_en: 'Wholesale' },
  { code: 'vip', name_ar: 'VIP', name_en: 'VIP' },
];
