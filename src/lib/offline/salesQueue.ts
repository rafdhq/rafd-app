import { apiFetch, ApiError } from '../apiClient';
import { enqueueOutbox, cacheGet, cacheSetCollection } from './db';

export type SalePayload = Record<string, unknown>;

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

  return { sale: localSale, offline: true };
}
