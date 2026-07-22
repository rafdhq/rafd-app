import { Outlet, useNavigate } from 'react-router-dom';
import { Crown, LogOut, Moon, Sun, Store } from 'lucide-react';
import Button from '../ui/Button';
import Logo from '../brand/Logo';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';

export default function AdminShell() {
  const { profile, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  return (
    <div className="min-h-dvh bg-app safe-pt safe-px" dir="rtl">
      <header className="sticky top-0 z-40 border-b border-app bg-[#020617] text-white">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-2 px-3 sm:h-16 sm:gap-3 sm:px-4 lg:px-6">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-300 sm:h-10 sm:w-10">
              <Crown className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-bold tracking-tight">بوابة إدارة نظام رفد</div>
              <div className="hidden text-[11px] text-slate-400 sm:block">Platform Control · Super Admin</div>
            </div>
          </div>

          <div className="ms-auto flex shrink-0 items-center gap-1 sm:gap-2">
            <div className="hidden text-end md:block">
              <div className="text-sm font-medium">{profile?.full_name || 'مسؤول المنصة'}</div>
              <div className="max-w-[180px] truncate text-[11px] text-slate-400">{profile?.email}</div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="text-slate-200 hover:bg-white/10"
              onClick={toggleTheme}
              aria-label="تبديل المظهر"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-white/15 bg-transparent text-slate-100 hover:bg-white/10"
              onClick={async () => {
                await signOut();
                navigate('/admin/login');
              }}
            >
              <LogOut className="h-4 w-4" />
              خروج
            </Button>
          </div>
        </div>
      </header>

      <div className="border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-800 dark:text-amber-200">
        هذه بوابة إدارة المنصة — منفصلة تماماً عن واجهة المتجر ونقطة البيع
      </div>

      <main className="mx-auto w-full max-w-[1400px] p-3 sm:p-4 lg:p-6 page-enter page-container safe-pb">
        <Outlet />
      </main>

      <footer className="border-t border-app px-3 py-6 text-center text-xs text-muted safe-pb">
        <div className="mb-2 flex justify-center opacity-80">
          <Logo size="sm" variant="mark" />
        </div>
        رفد Platform Admin · لا تشارك بيانات الدخول مع مستخدمي المتاجر
        <div className="mt-2">
          <button
            type="button"
            className="inline-flex items-center gap-1 text-primary hover:underline"
            onClick={() => navigate('/login')}
          >
            <Store className="h-3.5 w-3.5" />
            تسجيل دخول المتجر
          </button>
        </div>
      </footer>
    </div>
  );
}
