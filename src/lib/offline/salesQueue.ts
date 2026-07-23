import { apiFetch, ApiError } from '../apiClient';
import { enqueueOutbox, cacheGet, cacheSetCollection } from './db';
import { saleItemStockDelta } from '../inventory/stockDelta';

export type SalePayload = Record<string, unknown>;

type SaleItemLike = {
  product_id?: number;
  quantity?: number;
  weight_g?: number | null;
  sold_by_weight?: boolean;
};

/**
 * BL-02 (offline half): when a sale is queued offline it must also draw down the
 * cached stock immediately, otherwise the local product list keeps showing the
 * pre-sale quantity until the next sync. Weight items are decremented in kg (the
 * stock unit). Negative results are allowed and are reconciled to server truth
 * by `pullTenantSnapshots` on the next sync.
 */
async function applyOptimisticStock(tenantId: number, items: unknown): Promise<void> {
  if (!Array.isArray(items) || !items.length) return;
  const products = (await cacheGet<Array<Record<string, unknown>>>(`products:list:${tenantId}`)) || [];
  if (!products.length) return;

  const decById = new Map<number, number>();
  for (const raw of items) {
    const it = raw as SaleItemLike;
    if (it.product_id == null) continue;
    const dec = saleItemStockDelta(it);
    if (!(dec > 0)) continue;
    decById.set(it.product_id, (decById.get(it.product_id) || 0) + dec);
  }
  if (!decById.size) return;

  const updated = products.map((p) => {
    const id = Number((p as { id?: number }).id);
    const dec = decById.get(id);
    if (!dec) return p;
    return { ...p, stock: Number((p as { stock?: number }).stock || 0) - dec };
  });
  await cacheSetCollection('products', tenantId, updated as Array<{ id: number } & Record<string, unknown>>);
}

/**
 * Create sale online, or enqueue to outbox when offline / network error.
 * Optimistic local cache append for recent sales list.
 */
export async function createSaleWithOffline(
  payload: SalePayload,
  tenantId: number
): Promise<{ sale: Record<string, unknown>; offline: boolean }> {
  const offline = typeof navigator !== 'undefined' && !navigator.onLine;

  if (!offline) {
    try {
      const sale = await apiFetch<Record<string, unknown>>('/api/sales', {
        method: 'POST',
        body: JSON.stringify(payload),
        tenantId,
      });
      return { sale, offline: false };
    } catch (err) {
      // network-ish failures fall back to outbox
      const status = err instanceof ApiError ? err.status : 0;
      if (status && status < 500 && status !== 0) throw err;
    }
  }

  const localId = `local-${Date.now()}`;
  const localSale = {
    ...payload,
    id: localId,
    status: payload.status || 'completed',
    created_at: new Date().toISOString(),
    _offline: true,
  };

  await enqueueOutbox({
    tenant_id: tenantId,
    type: 'sale',
    method: 'POST',
    url: '/api/sales',
    body: { ...payload, client_local_id: localId },
  });

  try {
    const key = `sales:list:${tenantId}`;
    const existing = (await cacheGet<Array<Record<string, unknown>>>(key)) || [];
    await cacheSetCollection('sales', tenantId, [localSale as { id: string }, ...existing] as never);
  } catch {
    /* cache optional */
  }

  try {
    await applyOptimisticStock(tenantId, (payload as { items?: unknown }).items);
  } catch {
    /* cache optional */
  }

  return { sale: localSale, offline: true };
}
