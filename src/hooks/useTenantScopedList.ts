import { useCallback, useEffect, useState } from 'react';
import { apiFetch, ApiError } from '../lib/apiClient';
import { cacheGet, cacheSetCollection } from '../lib/offline/db';

export type PageDataStatus = 'loading' | 'no-tenant' | 'ready' | 'error';
export type PageDataErrorKind = 'network' | 'auth' | 'permission' | 'server' | null;

export interface UseTenantScopedListResult<T> {
  items: T[];
  setItems: React.Dispatch<React.SetStateAction<T[]>>;
  status: PageDataStatus;
  errorKind: PageDataErrorKind;
  errorMessage: string;
  /** True when `items` came from the local offline cache instead of a live fetch. */
  offlineServed: boolean;
  reload: () => Promise<void>;
}

/**
 * Root-cause fix for the Products/Inventory "stuck loading" bug: the old
 * `load()` functions did `if (!tenant?.id) return;` with no `setLoading(false)`,
 * so a page whose tenant never resolved spun on the skeleton forever — and every
 * other failure mode (permission, 401, 5xx, offline) collapsed into one generic
 * "فشل التحميل" message with no distinction and no offline fallback.
 *
 * This hook makes each case an explicit, terminal state:
 *  - no-tenant   : tenantId is null — nothing to load, not a bug, show setup CTA.
 *  - ready       : items loaded (possibly empty — "no products" is a valid ready state).
 *  - error/auth       : 401 — session invalid, must re-login.
 *  - error/permission : 403 — authenticated but not authorized.
 *  - error/server      : non-2xx server response other than 401/403.
 *  - error/network     : fetch threw (offline / DNS / CORS) AND no cached copy exists.
 *
 * When online fetch succeeds, the result is written to the same IndexedDB cache
 * key the sync engine uses (`${table}:list:${tenantId}`) so the page can serve
 * from cache next time the device is offline (`offlineServed: true`).
 */
export function useTenantScopedList<T extends { id: number | string }>(
  table: string,
  tenantId: number | null,
  path: string | null
): UseTenantScopedListResult<T> {
  const [items, setItems] = useState<T[]>([]);
  const [status, setStatus] = useState<PageDataStatus>('loading');
  const [errorKind, setErrorKind] = useState<PageDataErrorKind>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [offlineServed, setOfflineServed] = useState(false);

  const reload = useCallback(async () => {
    if (tenantId == null || !path) {
      setStatus('no-tenant');
      setItems([]);
      return;
    }
    setStatus('loading');
    setErrorKind(null);
    setErrorMessage('');

    const cacheKey = `${table}:list:${tenantId}`;
    const offlineNow = typeof navigator !== 'undefined' && !navigator.onLine;

    if (offlineNow) {
      const cached = await cacheGet<T[]>(cacheKey);
      if (cached) {
        setItems(cached);
        setOfflineServed(true);
        setStatus('ready');
        return;
      }
      setStatus('error');
      setErrorKind('network');
      setErrorMessage('لا يوجد اتصال بالإنترنت، ولا توجد بيانات محفوظة محلياً بعد لعرضها.');
      return;
    }

    try {
      const data = await apiFetch<T[]>(path, { tenantId });
      setItems(data);
      setOfflineServed(false);
      setStatus('ready');
      try {
        await cacheSetCollection(table, tenantId, data as unknown as Array<{ id: number | string } & Record<string, unknown>>);
      } catch {
        /* cache is best-effort */
      }
    } catch (err) {
      const status401or403 = err instanceof ApiError ? err.status : 0;
      if (status401or403 === 401) {
        setStatus('error');
        setErrorKind('auth');
        setErrorMessage('انتهت صلاحية الجلسة — يرجى تسجيل الدخول مرة أخرى.');
        return;
      }
      if (status401or403 === 403) {
        setStatus('error');
        setErrorKind('permission');
        setErrorMessage('لا تملك صلاحية الوصول لهذه البيانات.');
        return;
      }

      // Network failure (fetch threw / status 0) or a server error (5xx) — try
      // the offline cache before giving up, so a flaky connection degrades to
      // "served from cache" instead of an error screen.
      const cached = await cacheGet<T[]>(cacheKey);
      if (cached) {
        setItems(cached);
        setOfflineServed(true);
        setStatus('ready');
        return;
      }

      setStatus('error');
      if (status401or403 && status401or403 >= 400) {
        // Any real HTTP response (4xx/5xx) reached the server — it is not a
        // connectivity problem, even if it isn't specifically 401/403.
        setErrorKind('server');
        setErrorMessage('حدث خطأ في الخادم أثناء تحميل البيانات. حاول مرة أخرى.');
      } else {
        // status === 0: fetch() itself threw (no HTTP response reached us at all).
        setErrorKind('network');
        setErrorMessage('تعذر الاتصال بالخادم — تحقق من اتصالك بالإنترنت.');
      }
    }
  }, [table, tenantId, path]);

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload]);

  return { items, setItems, status, errorKind, errorMessage, offlineServed, reload };
}
