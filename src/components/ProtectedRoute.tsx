import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

/**
 * Protects store (tenant) routes.
 * - Superadmins go to platform admin portal
 * - Expired / trial-ended tenants are forced to /subscription
 */
export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();
  const location = useLocation();
  const [subCheck, setSubCheck] = useState<'loading' | 'ok' | 'blocked'>('loading');

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!user || !profile || profile.role === 'superadmin') {
        if (!cancelled) setSubCheck('ok');
        return;
      }
      // Allow subscription page itself always
      if (location.pathname.startsWith('/subscription')) {
        if (!cancelled) setSubCheck('ok');
        return;
      }
      const tenantId = profile.tenant_id;
      if (!tenantId) {
        if (!cancelled) setSubCheck('ok');
        return;
      }
      try {
        const res = await fetch(`/api/subscription?tenant_id=${tenantId}`);
        if (!res.ok) {
          if (!cancelled) setSubCheck('ok');
          return;
        }
        const data = await res.json();
        if (!cancelled) {
          setSubCheck(data?.access?.can_use_store === false ? 'blocked' : 'ok');
        }
      } catch {
        if (!cancelled) setSubCheck('ok');
      }
    };
    if (!loading) run();
    return () => {
      cancelled = true;
    };
  }, [user, profile, loading, location.pathname]);

  if (loading || (user && profile && subCheck === 'loading' && !location.pathname.startsWith('/subscription'))) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-app">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted">جاري التحقق من الاشتراك...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (profile?.role === 'superadmin') {
    return <Navigate to="/admin" replace />;
  }

  if (subCheck === 'blocked' && !location.pathname.startsWith('/subscription')) {
    return (
      <Navigate
        to="/subscription"
        replace
        state={{ locked: true, from: location.pathname }}
      />
    );
  }

  return <>{children}</>;
}
