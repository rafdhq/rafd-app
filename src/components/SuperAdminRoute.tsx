import { Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

/**
 * Protects the platform admin area.
 * Only authenticated users with role === 'superadmin' may enter.
 * Store owners/staff are redirected to the store app.
 */
export default function SuperAdminRoute({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#020617]" dir="rtl">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-teal-400" />
          <p className="text-sm text-slate-400">جاري التحقق من صلاحيات المنصة...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  }

  // Wait briefly for profile if user exists but profile not yet loaded
  if (user && !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#020617]" dir="rtl">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-teal-400" />
          <p className="text-sm text-slate-400">تحميل ملف المسؤول...</p>
        </div>
      </div>
    );
  }

  if (profile?.role !== 'superadmin') {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
