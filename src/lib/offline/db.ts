/** IndexedDB wrapper for RAFD offline-first outbox + caches */

const DB_NAME = 'rafd-offline-v1';
const DB_VERSION = 1;

export type OutboxStatus = 'pending' | 'syncing' | 'failed' | 'done';

export interface OutboxItem {
  id: string;
  tenant_id: number;
  type: 'sale' | 'product' | 'product_stock' | 'customer' | 'expense' | 'generic';
  method: string;
  url: string;
  body: unknown;
  status: OutboxStatus;
  attempts: number;
  last_error?: string | null;
  created_at: string;
  updated_at: string;
  idempotency_key: string;
}

export interface CachedRow {
  key: string; // `${table}:${tenant_id}` or `${table}:${tenant_id}:${id}`
  table: string;
  tenant_id: number;
  id?: number | string;
  data: unknown;
  updated_at: string;
  version: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('outbox')) {
        const os = db.createObjectStore('outbox', { keyPath: 'id' });
        os.createIndex('by_status', 'status', { unique: false });
        os.createIndex('by_tenant', 'tenant_id', { unique: false });
      }
      if (!db.objectStoreNames.contains('cache')) {
        const cs = db.createObjectStore('cache', { keyPath: 'key' });
        cs.createIndex('by_table_tenant', ['table', 'tenant_id'], { unique: false });
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IDB open failed'));
  });
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | void
): Promise<T | void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    let req: IDBRequest<T> | void;
    try {
      req = fn(store);
    } catch (e) {
      reject(e);
      return;
    }
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error || new Error('IDB tx failed'));
    if (req) {
      req.onerror = () => reject(req.error);
    }
  });
}

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function enqueueOutbox(
  item: Omit<OutboxItem, 'id' | 'status' | 'attempts' | 'created_at' | 'updated_at' | 'idempotency_key'> & {
    idempotency_key?: string;
  }
): Promise<OutboxItem> {
  const now = new Date().toISOString();
  const row: OutboxItem = {
    id: uid(),
    status: 'pending',
    attempts: 0,
    created_at: now,
    updated_at: now,
    idempotency_key: item.idempotency_key || uid(),
    last_error: null,
    ...item,
  };
  await withStore('outbox', 'readwrite', (s) => s.put(row));
  return row;
}

export async function listOutbox(status?: OutboxStatus): Promise<OutboxItem[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('outbox', 'readonly');
    const store = tx.objectStore('outbox');
    const req = status ? store.index('by_status').getAll(status) : store.getAll();
    req.onsuccess = () => resolve((req.result as OutboxItem[]) || []);
    req.onerror = () => reject(req.error);
  });
}

export async function updateOutbox(id: string, patch: Partial<OutboxItem>) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('outbox', 'readwrite');
    const store = tx.objectStore('outbox');
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const cur = getReq.result as OutboxItem | undefined;
      if (!cur) {
        resolve();
        return;
      }
      const next = { ...cur, ...patch, updated_at: new Date().toISOString() };
      store.put(next);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function removeOutbox(id: string) {
  await withStore('outbox', 'readwrite', (s) => s.delete(id));
}

export async function countPendingOutbox(tenantId?: number) {
  const all = await listOutbox('pending');
  const failed = await listOutbox('failed');
  const rows = [...all, ...failed];
  return tenantId ? rows.filter((r) => r.tenant_id === tenantId).length : rows.length;
}

export async function cacheSet(row: CachedRow) {
  await withStore('cache', 'readwrite', (s) => s.put(row));
}

export async function cacheGet<T = unknown>(key: string): Promise<T | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('cache', 'readonly');
    const req = tx.objectStore('cache').get(key);
    req.onsuccess = () => resolve((req.result as CachedRow | undefined)?.data as T ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function cacheSetCollection(
  table: string,
  tenantId: number,
  rows: Array<{ id: number | string } & Record<string, unknown>>,
  version = 1
) {
  const now = new Date().toISOString();
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('cache', 'readwrite');
    const store = tx.objectStore('cache');
    store.put({
      key: `${table}:list:${tenantId}`,
      table,
      tenant_id: tenantId,
      data: rows,
      updated_at: now,
      version,
    } satisfies CachedRow);
    for (const r of rows) {
      store.put({
        key: `${table}:${tenantId}:${r.id}`,
        table,
        tenant_id: tenantId,
        id: r.id,
        data: r,
        updated_at: now,
        version,
      } satisfies CachedRow);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function metaGet<T = unknown>(key: string): Promise<T | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('meta', 'readonly');
    const req = tx.objectStore('meta').get(key);
    req.onsuccess = () => resolve((req.result as { key: string; value: T } | undefined)?.value ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function metaSet(key: string, value: unknown) {
  await withStore('meta', 'readwrite', (s) => s.put({ key, value }));
}

export async function isOfflineDbAvailable() {
  try {
    await openDb();
    return true;
  } catch {
    return false;
  }
}
