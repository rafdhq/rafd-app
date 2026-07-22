import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useTenant } from './TenantContext';
import type { SubscriptionPayload } from '../lib/subscriptionAccess';
import { getDeviceId } from '../lib/device';

interface SubscriptionContextValue {
  data: SubscriptionPayload | null;
  loading: boolean;
  canUseStore: boolean;
  daysRemaining: number;
  phase: string;
  refresh: () => Promise<void>;
  deviceId: string;
}

const SubscriptionContext = createContext<SubscriptionContextValue>({
  data: null,
  loading: true,
  canUseStore: true,
  daysRemaining: 0,
  phase: 'none',
  refresh: async () => {},
  deviceId: '',
});

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { tenant, loading: tenantLoading } = useTenant();
  const [data, setData] = useState<SubscriptionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const deviceId = useMemo(() => getDeviceId(), []);

  const refresh = useCallback(async () => {
    if (!tenant?.id) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/subscription?tenant_id=${tenant.id}`);
      if (res.ok) {
        const json = (await res.json()) as SubscriptionPayload;
        setData(json);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [tenant?.id]);

  useEffect(() => {
    if (tenantLoading) return;
    refresh();
  }, [tenantLoading, refresh]);

  // touch device last_seen occasionally (non-blocking)
  useEffect(() => {
    if (!tenant?.id || !deviceId) return;
    fetch('/api/subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'init-trial',
        tenant_id: tenant.id,
        plan_code: tenant.plan || 'growth',
        device_id: deviceId,
      }),
    }).catch(() => undefined);
  }, [tenant?.id, tenant?.plan, deviceId]);

  const value: SubscriptionContextValue = {
    data,
    loading: tenantLoading || loading,
    canUseStore: data?.access?.can_use_store !== false,
    daysRemaining: data?.access?.days_remaining ?? 0,
    phase: data?.access?.phase || data?.subscription?.status || 'none',
    refresh,
    deviceId,
  };

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}

export const useSubscription = () => useContext(SubscriptionContext);
