import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Branch, Tenant } from '../lib/types';
import { useAuth } from './AuthContext';

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
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [currentBranchId, setCurrentBranchId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshTenant = async () => {
    const tenantId = profile?.tenant_id ?? 1;
    try {
      const [tRes, bRes] = await Promise.all([
        fetch(`/api/tenants?id=${tenantId}`),
        fetch(`/api/branches?tenant_id=${tenantId}`),
      ]);
      if (tRes.ok) {
        const tData = await tRes.json();
        const t = Array.isArray(tData) ? tData[0] : tData;
        setTenant(t || null);
        if (t?.primary_color) {
          document.documentElement.style.setProperty('--tenant-primary', t.primary_color);
        }
      }
      if (bRes.ok) {
        const bData: Branch[] = await bRes.json();
        setBranches(bData || []);
        const preferred =
          profile?.branch_id ||
          bData.find((b) => b.is_main)?.id ||
          bData[0]?.id ||
          null;
        setCurrentBranchId((prev) => prev ?? preferred);
      }
    } catch (err) {
      console.error(err);
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
