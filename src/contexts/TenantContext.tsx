import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Branch, Tenant } from '../lib/types';
import { useAuth } from './AuthContext';
import {
  getCachedBranches,
  getCachedTenant,
  saveCachedBranches,
  saveCachedTenant,
} from '../lib/offline/localSession';

interface TenantContextValue {
  tenant: Tenant | null;
  branches: Branch[];
  currentBranch: Branch | null;
  setCurrentBranchId: (id: number) => void;
  loading: boolean;
  refreshTenant: () => Promise<void>;
}

const TenantContext = createContext<TenantContextValue>({
  tenant: null,
  branches: [],
  currentBranch: null,
  setCurrentBranchId: () => {},
  loading: true,
  refreshTenant: async () => {},
});

export function TenantProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  // Seed from the offline cache so the store is usable before/without network.
  const [tenant, setTenant] = useState<Tenant | null>(() => getCachedTenant());
  const [branches, setBranches] = useState<Branch[]>(() => getCachedBranches());
  const [currentBranchId, setCurrentBranchId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const applyBranches = (bData: Branch[]) => {
    setBranches(bData || []);
    const preferred =
      profile?.branch_id ||
      bData.find((b) => b.is_main)?.id ||
      bData[0]?.id ||
      null;
    setCurrentBranchId((prev) => prev ?? preferred);
  };

  const refreshTenant = async () => {
    // BL-10: never fall back to the demo store (tenant_id = 1). A user with no
    // resolved tenant gets no store data — the app must route them to setup.
    const tenantId = profile?.tenant_id ?? getCachedTenant()?.id ?? null;
    if (tenantId == null) {
      setTenant(null);
      setBranches([]);
      setLoading(false);
      return;
    }
    try {
      const [tRes, bRes] = await Promise.all([
        fetch(`/api/tenants?id=${tenantId}`),
        fetch(`/api/branches?tenant_id=${tenantId}`),
      ]);
      if (tRes.ok) {
        const tData = await tRes.json();
        const t = Array.isArray(tData) ? tData[0] : tData;
        if (t) {
          setTenant(t);
          saveCachedTenant(t);
          if (t.primary_color) {
            document.documentElement.style.setProperty('--tenant-primary', t.primary_color);
          }
        }
      }
      if (bRes.ok) {
        const bData: Branch[] = await bRes.json();
        applyBranches(bData || []);
        saveCachedBranches(bData || []);
      }
    } catch (err) {
      // Offline / network failure — fall back to the last known cached tenant.
      console.error(err);
      const cachedTenant = getCachedTenant();
      const cachedBranches = getCachedBranches();
      if (cachedTenant) {
        setTenant(cachedTenant);
        if (cachedTenant.primary_color) {
          document.documentElement.style.setProperty('--tenant-primary', cachedTenant.primary_color);
        }
      }
      if (cachedBranches.length) applyBranches(cachedBranches);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshTenant();
  }, [profile?.tenant_id, profile?.branch_id]);

  const currentBranch = useMemo(
    () => branches.find((b) => b.id === currentBranchId) || branches[0] || null,
    [branches, currentBranchId]
  );

  return (
    <TenantContext.Provider
      value={{
        tenant,
        branches,
        currentBranch,
        setCurrentBranchId: (id) => setCurrentBranchId(id),
        loading,
        refreshTenant,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
}

export const useTenant = () => useContext(TenantContext);
