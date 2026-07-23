import { apiFetch, ApiError } from '../apiClient';
import { enqueueOutbox, cacheGet, cacheSetCollection, listOutbox, removeOutbox } from './db';

export type ProductLike = { id: number | string } & Record<string, unknown>;

function isOffline() {
  return typeof navigator !== 'undefined' && !navigator.onLine;
}

/** True for a network-ish failure (offline, DNS, server 5xx) — worth queuing.
 * False for a real rejection (validation, 401/403/404) that must surface to the user. */
function isQueueableFailure(err: unknown): boolean {
  if (!(err instanceof ApiError)) return true; // fetch threw (TypeError) => network/offline
  return err.status === 0 || err.status >= 500;
}

async function getCachedList(tenantId: number): Promise<ProductLike[]> {
  return (await cacheGet<ProductLike[]>(`products:list:${tenantId}`)) || [];
}

async function setCachedList(tenantId: number, rows: ProductLike[]) {
  await cacheSetCollection('products', tenantId, rows as Array<{ id: number | string } & Record<string, unknown>>);
}

/**
 * BL-audit follow-up: Products/Inventory previously had zero offline support —
 * every mutation was a bare `fetch()` with no outbox fallback, so a save while
 * offline silently failed (network error swallowed, no queue, no UI feedback).
 * These wrappers mirror the sales offline pattern (salesQueue.ts): try the real
 * API first; on a network/server failure, apply the change to the local cache
 * optimistically and enqueue it in the outbox for the sync engine to replay.
 * Genuine rejections (validation, permission) are NOT queued — they are
 * re-thrown so the caller can show the real error instead of hiding it.
 */
export async function createProductWithOffline(
  payload: Record<string, unknown>,
  tenantId: number
): Promise<{ product: ProductLike; offline: boolean }> {
  if (!isOffline()) {
    try {
      const created = await apiFetch<ProductLike>('/api/products', {
        method: 'POST',
        body: JSON.stringify(payload),
        tenantId,
      });
      const list = await getCachedList(tenantId);
      await setCachedList(tenantId, [created, ...list]);
      return { product: created, offline: false };
    } catch (err) {
      if (!isQueueableFailure(err)) throw err;
    }
  }

  const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const localProduct: ProductLike = { ...payload, id: localId, _offline: true };
  await enqueueOutbox({
    tenant_id: tenantId,
    type: 'product',
    method: 'POST',
    url: '/api/products',
    body: { ...payload, client_local_id: localId },
  });
  const list = await getCachedList(tenantId);
  await setCachedList(tenantId, [localProduct, ...list]);
  return { product: localProduct, offline: true };
}

export async function updateProductWithOffline(
  payload: { id: number | string } & Record<string, unknown>,
  tenantId: number
): Promise<{ product: ProductLike | null; offline: boolean }> {
  const isLocalOnly = typeof payload.id === 'string' && payload.id.startsWith('local-');

  if (!isOffline() && !isLocalOnly) {
    try {
      const updated = await apiFetch<ProductLike>('/api/products', {
        method: 'PUT',
        body: JSON.stringify(payload),
        tenantId,
      });
      const list = await getCachedList(tenantId);
      await setCachedList(
        tenantId,
        list.map((p) => (p.id === updated.id ? updated : p))
      );
      return { product: updated, offline: false };
    } catch (err) {
      if (!isQueueableFailure(err)) throw err;
    }
  }

  const list = await getCachedList(tenantId);
  const merged = list.map((p) => (p.id === payload.id ? { ...p, ...payload, _offline: true } : p));
  await setCachedList(tenantId, merged);

  if (isLocalOnly) {
    // Never left the device: patch the still-queued CREATE body in place rather
    // than queuing a PUT against an id the server has never seen.
    const pending = await listOutbox('pending');
    const createItem = pending.find(
      (o) =>
        o.type === 'product' &&
        o.method === 'POST' &&
        (o.body as Record<string, unknown> | undefined)?.client_local_id === payload.id
    );
    if (createItem) {
      const rest: Record<string, unknown> = { ...payload };
      delete rest.id;
      await enqueueOutbox({
        tenant_id: tenantId,
        type: 'product',
        method: 'POST',
        url: '/api/products',
        body: { ...(createItem.body as Record<string, unknown>), ...rest },
      });
      await removeOutbox(createItem.id);
    }
    return { product: merged.find((p) => p.id === payload.id) || null, offline: true };
  }

  await enqueueOutbox({ tenant_id: tenantId, type: 'product', method: 'PUT', url: '/api/products', body: payload });
  return { product: merged.find((p) => p.id === payload.id) || null, offline: true };
}

export async function deleteProductWithOffline(
  id: number | string,
  tenantId: number
): Promise<{ offline: boolean }> {
  const isLocalOnly = typeof id === 'string' && id.startsWith('local-');

  if (!isOffline() && !isLocalOnly) {
    try {
      await apiFetch('/api/products', { method: 'DELETE', body: JSON.stringify({ id }), tenantId });
      const list = await getCachedList(tenantId);
      await setCachedList(
        tenantId,
        list.filter((p) => p.id !== id)
      );
      return { offline: false };
    } catch (err) {
      if (!isQueueableFailure(err)) throw err;
    }
  }

  const list = await getCachedList(tenantId);
  await setCachedList(
    tenantId,
    list.filter((p) => p.id !== id)
  );

  if (isLocalOnly) {
    // Never left the device: drop the pending CREATE instead of queuing a DELETE
    // for an id the server never assigned.
    const pending = await listOutbox('pending');
    const createItem = pending.find(
      (o) =>
        o.type === 'product' &&
        o.method === 'POST' &&
        (o.body as Record<string, unknown> | undefined)?.client_local_id === id
    );
    if (createItem) await removeOutbox(createItem.id);
    return { offline: true };
  }

  await enqueueOutbox({ tenant_id: tenantId, type: 'product', method: 'DELETE', url: '/api/products', body: { id } });
  return { offline: true };
}
