import { apiFetch } from '../apiClient';
import {
  countPendingOutbox,
  listOutbox,
  updateOutbox,
  removeOutbox,
  cacheSetCollection,
  metaSet,
  metaGet,
  type OutboxItem,
} from './db';

export type SyncEngineResult = {
  pushed: number;
  failed: number;
  pulled: boolean;
  pending: number;
  last_sync_at: string | null;
  message: string;
};

async function pushOne(item: OutboxItem): Promise<void> {
  await updateOutbox(item.id, { status: 'syncing', attempts: item.attempts + 1 });
  try {
    await apiFetch(item.url, {
      method: item.method || 'POST',
      body: JSON.stringify(item.body ?? {}),
      tenantId: item.tenant_id,
      headers: {
        'X-Idempotency-Key': item.idempotency_key,
        'X-Client-Offline': '1',
      },
    });
    await removeOutbox(item.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'sync push failed';
    await updateOutbox(item.id, { status: 'failed', last_error: message });
    throw err;
  }
}

export async function pullTenantSnapshots(tenantId: number) {
  const [products, customers, sales] = await Promise.all([
    apiFetch<unknown[]>(`/api/products?tenant_id=${tenantId}`, { tenantId }),
    apiFetch<unknown[]>(`/api/customers?tenant_id=${tenantId}`, { tenantId }),
    apiFetch<unknown[]>(`/api/sales?tenant_id=${tenantId}`, { tenantId }),
  ]);

  const version = Date.now();
  await cacheSetCollection(
    'products',
    tenantId,
    (products as Array<{ id: number }>).map((p) => ({ ...p })),
    version
  );
  await cacheSetCollection(
    'customers',
    tenantId,
    (customers as Array<{ id: number }>).map((c) => ({ ...c })),
    version
  );
  await cacheSetCollection(
    'sales',
    tenantId,
    (sales as Array<{ id: number }>).map((s) => ({ ...s })),
    version
  );

  // server-side sync clock
  await apiFetch('/api/sync', {
    method: 'POST',
    tenantId,
    body: JSON.stringify({
      tenant_id: tenantId,
      client_pending: await countPendingOutbox(tenantId),
      pull_version: version,
    }),
  });
}

export async function runSyncEngine(tenantId: number): Promise<SyncEngineResult> {
  if (!navigator.onLine) {
    const pending = await countPendingOutbox(tenantId);
    return {
      pushed: 0,
      failed: 0,
      pulled: false,
      pending,
      last_sync_at: (await metaGet<string>(`last_sync_at:${tenantId}`)) || null,
      message: 'دون اتصال — سيتم المزامنة عند عودة الشبكة',
    };
  }

  let pushed = 0;
  let failed = 0;

  const pendingItems = [
    ...(await listOutbox('pending')),
    ...(await listOutbox('failed')),
  ].filter((i) => i.tenant_id === tenantId);

  // conflict strategy: chronological outbox order (created_at asc)
  pendingItems.sort((a, b) => a.created_at.localeCompare(b.created_at));

  for (const item of pendingItems) {
    try {
      await pushOne(item);
      pushed += 1;
    } catch {
      failed += 1;
    }
  }

  let pulled = false;
  try {
    await pullTenantSnapshots(tenantId);
    pulled = true;
  } catch (err) {
    console.error('pull failed', err);
  }

  const now = new Date().toISOString();
  await metaSet(`last_sync_at:${tenantId}`, now);
  const pending = await countPendingOutbox(tenantId);

  return {
    pushed,
    failed,
    pulled,
    pending,
    last_sync_at: now,
    message:
      failed > 0
        ? `تمت مزامنة ${pushed} عنصرًا مع ${failed} فشل`
        : `تمت المزامنة بنجاح (${pushed} صادر / سحب ${pulled ? 'نعم' : 'لا'})`,
  };
}
