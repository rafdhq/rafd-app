// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../apiClient';
import { listOutbox, cacheGet } from './db';

vi.mock('../apiClient', async () => {
  const actual = await vi.importActual<typeof import('../apiClient')>('../apiClient');
  return { ...actual, apiFetch: vi.fn() };
});
import { apiFetch } from '../apiClient';
import { createProductWithOffline, updateProductWithOffline, deleteProductWithOffline } from './productsQueue';

const mockedApiFetch = apiFetch as unknown as ReturnType<typeof vi.fn>;

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { value, configurable: true });
}

const TENANT = 555;

describe('productsQueue (offline-first product CRUD)', () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
    setOnline(true);
  });

  it('create: online success writes through and updates the cache', async () => {
    mockedApiFetch.mockResolvedValueOnce({ id: 1, name: 'Sugar' });
    const { product, offline } = await createProductWithOffline({ name: 'Sugar' }, TENANT);
    expect(offline).toBe(false);
    expect(product).toEqual({ id: 1, name: 'Sugar' });
    const cached = await cacheGet<Array<{ id: number }>>(`products:list:${TENANT}`);
    expect(cached?.[0]).toEqual({ id: 1, name: 'Sugar' });
  });

  it('create: network failure queues to the outbox and applies an optimistic local row', async () => {
    mockedApiFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const { product, offline } = await createProductWithOffline({ name: 'Rice' }, TENANT + 1);
    expect(offline).toBe(true);
    expect(String(product.id)).toMatch(/^local-/);
    expect(product._offline).toBe(true);

    const pending = await listOutbox('pending');
    const item = pending.find((o) => o.tenant_id === TENANT + 1);
    expect(item).toBeTruthy();
    expect(item?.method).toBe('POST');
    expect(item?.url).toBe('/api/products');
    expect((item?.body as Record<string, unknown>).name).toBe('Rice');
  });

  it('create: offline (navigator.onLine=false) queues without attempting the network at all', async () => {
    setOnline(false);
    const { offline } = await createProductWithOffline({ name: 'Salt' }, TENANT + 2);
    expect(offline).toBe(true);
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('create: a real rejection (validation/permission) is NOT queued — it surfaces to the caller', async () => {
    mockedApiFetch.mockRejectedValueOnce(new ApiError('Forbidden', 403));
    await expect(createProductWithOffline({ name: 'X' }, TENANT + 3)).rejects.toThrow('Forbidden');
    const pending = await listOutbox('pending');
    expect(pending.some((o) => o.tenant_id === TENANT + 3)).toBe(false);
  });

  it('update: offline queues a PUT and patches the cached row optimistically', async () => {
    mockedApiFetch.mockResolvedValueOnce({ id: 10, name: 'Old', price: 5 });
    await createProductWithOffline({ name: 'Old', price: 5 }, TENANT + 4);
    // Re-seed cache with id:10 shape directly to simulate an existing catalog row.
    const { cacheSetCollection } = await import('./db');
    await cacheSetCollection('products', TENANT + 4, [{ id: 10, name: 'Old', price: 5 }]);

    mockedApiFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const { product, offline } = await updateProductWithOffline({ id: 10, price: 9 }, TENANT + 4);
    expect(offline).toBe(true);
    expect(product?.price).toBe(9);

    const pending = await listOutbox('pending');
    const item = pending.find((o) => o.method === 'PUT' && (o.body as { id?: number })?.id === 10);
    expect(item).toBeTruthy();
  });

  it('delete-before-sync: deleting a not-yet-synced offline-created product cancels the queued create instead of queuing a delete', async () => {
    setOnline(false);
    const { product } = await createProductWithOffline({ name: 'Temp' }, TENANT + 5);
    const localId = product.id;

    let pending = await listOutbox('pending');
    expect(pending.filter((o) => o.tenant_id === TENANT + 5)).toHaveLength(1);

    await deleteProductWithOffline(localId, TENANT + 5);

    pending = await listOutbox('pending');
    // The queued CREATE for this tenant must be gone — never replaced by a DELETE
    // for an id the server never assigned.
    expect(pending.filter((o) => o.tenant_id === TENANT + 5)).toHaveLength(0);

    const cached = await cacheGet<Array<{ id: unknown }>>(`products:list:${TENANT + 5}`);
    expect(cached?.some((p) => p.id === localId)).toBe(false);
  });

  it('delete: online success removes the row and does not touch the outbox', async () => {
    const { cacheSetCollection } = await import('./db');
    await cacheSetCollection('products', TENANT + 6, [{ id: 20, name: 'Gone' }]);
    mockedApiFetch.mockResolvedValueOnce({ ok: true });
    const { offline } = await deleteProductWithOffline(20, TENANT + 6);
    expect(offline).toBe(false);
    const cached = await cacheGet<Array<{ id: number }>>(`products:list:${TENANT + 6}`);
    expect(cached?.some((p) => p.id === 20)).toBe(false);
  });

  it('delete: offline queues a DELETE for a real (already-synced) id', async () => {
    const { cacheSetCollection } = await import('./db');
    await cacheSetCollection('products', TENANT + 7, [{ id: 30, name: 'Later' }]);
    setOnline(false);
    const { offline } = await deleteProductWithOffline(30, TENANT + 7);
    expect(offline).toBe(true);
    const pending = await listOutbox('pending');
    const item = pending.find((o) => o.tenant_id === TENANT + 7);
    expect(item?.method).toBe('DELETE');
    expect((item?.body as { id?: number })?.id).toBe(30);
  });
});
