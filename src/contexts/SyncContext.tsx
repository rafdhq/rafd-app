import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { SyncStatus } from '../lib/types';
import { countPendingOutbox } from '../lib/offline/db';
import { runSyncEngine } from '../lib/offline/syncEngine';

type ConnState = 'online' | 'offline' | 'syncing' | 'failed';

interface SyncContextValue {
  connection: ConnState;
  lastSyncAt: string | null;
  pendingChanges: number;
  message: string | null;
  triggerSync: () => Promise<void>;
}

const SyncContext = createContext<SyncContextValue>({
  connection: 'online',
  lastSyncAt: null,
  pendingChanges: 0,
  message: null,
  triggerSync: async () => {},
});

export function SyncProvider({ children, tenantId }: { children: ReactNode; tenantId?: number | null }) {
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [syncing, setSyncing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [pendingChanges, setPendingChanges] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  const refreshPending = useCallback(async () => {
    if (!tenantId) return;
    try {
      const n = await countPendingOutbox(tenantId);
      setPendingChanges(n);
    } catch {
      /* idb optional */
    }
  }, [tenantId]);

  const fetchStatus = useCallback(async () => {
    if (!tenantId) return;
    try {
      await refreshPending();
      const res = await fetch(`/api/sync?tenant_id=${tenantId}`);
      if (!res.ok) return;
      const data: SyncStatus | SyncStatus[] = await res.json();
      const row = Array.isArray(data) ? data[0] : data;
      if (row) {
        setLastSyncAt(row.last_sync_at || null);
        if (typeof row.pending_changes === 'number') {
          setPendingChanges((prev) => Math.max(prev, row.pending_changes || 0));
        }
        setMessage(row.message || null);
        if (row.status === 'failed') setFailed(true);
        else setFailed(false);
      }
    } catch {
      /* offline ok */
    }
  }, [tenantId, refreshPending]);

  useEffect(() => {
    const on = () => {
      setOnline(true);
      // auto-flush outbox when back online
      if (tenantId) {
        void runSyncEngine(tenantId).then((r) => {
          setLastSyncAt(r.last_sync_at);
          setPendingChanges(r.pending);
          setMessage(r.message);
          setFailed(r.failed > 0);
        });
      }
    };
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, [tenantId]);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 30000);
    return () => clearInterval(id);
  }, [fetchStatus]);

  const triggerSync = async () => {
    if (!tenantId) return;
    if (!navigator.onLine) {
      setMessage('أنت دون اتصال — العمليات تُحفظ محلياً');
      await refreshPending();
      return;
    }
    setSyncing(true);
    setFailed(false);
    try {
      const result = await runSyncEngine(tenantId);
      setLastSyncAt(result.last_sync_at);
      setPendingChanges(result.pending);
      setMessage(result.message);
      setFailed(result.failed > 0);
    } catch {
      setFailed(true);
      setMessage('فشلت المزامنة — سيتم إعادة المحاولة');
    } finally {
      setSyncing(false);
    }
  };

  let connection: ConnState = 'online';
  if (!online) connection = 'offline';
  else if (syncing) connection = 'syncing';
  else if (failed) connection = 'failed';

  return (
    <SyncContext.Provider value={{ connection, lastSyncAt, pendingChanges, message, triggerSync }}>
      {children}
    </SyncContext.Provider>
  );
}

export const useSync = () => useContext(SyncContext);
