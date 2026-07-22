import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Crown, Eye, EyeOff, Lock, Mail, ShieldAlert } from 'lucide-react';
import Logo from '../components/brand/Logo';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { useAuth } from '../contexts/AuthContext';
import supabase from '../lib/supabase';
import { useTheme } from '../contexts/ThemeContext';

export default function AdminLogin() {
  const { user, profile, loading, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@rafd.app');
  const [password, setPassword] = useState('password123');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Already authenticated as superadmin → admin console
  if (!loading && user && profile?.role === 'superadmin') {
    return <Navigate to="/admin" replace />;
  }

  // Store user logged in — do not show admin portal; send to store
  if (!loading && user && profile && profile.role !== 'superadmin') {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) throw err;

      const authEmail = data.user?.email || email;
      const res = await fetch(`/api/users?email=${encodeURIComponent(authEmail)}`);
      if (!res.ok) throw new Error('تعذر التحقق من صلاحيات المسؤول');
      const rows = await res.json();
      const userProfile = Array.isArray(rows) ? rows[0] : rows;

      if (!userProfile || userProfile.role !== 'superadmin') {
        await supabase.auth.signOut();
        throw new Error('هذا الحساب ليس مسؤولاً عن المنصة. استخدم تسجيل دخول المتجر.');
      }

      navigate('/admin');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'فشل تسجيل الدخول');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#020617]" dir="rtl">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-10">
        <div className="mb-8 flex items-center justify-between">
          <Logo inverted size="md" />
          <button type="button" onClick={toggleTheme} className="text-xs text-slate-400 hover:text-slate-200">
            {theme === 'dark' ? 'فاتح' : 'داكن'}
          </button>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-lift backdrop-blur">
          <div className="mb-6">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-200">
              <Crown className="h-3.5 w-3.5" />
              بوابة إدارة النظام · منفصلة عن المتجر
            </div>
            <h1 className="text-2xl font-bold text-white">دخول مسؤول المنصة</h1>
            <p className="mt-1.5 text-sm text-slate-400">
              هذه الصفحة لإدارة رفد كمنصة SaaS فقط — وليست جزءاً من واجهة المتجر.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="بريد المسؤول"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              rightIcon={<Mail className="h-4 w-4" />}
              placeholder="admin@rafd.app"
              className="bg-[#0f172a] border-white/10 text-white"
            />
            <Input
              label="كلمة المرور"
              type={showPass ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              rightIcon={<Lock className="h-4 w-4" />}
              leftIcon={
                <button type="button" onClick={() => setShowPass((v) => !v)} className="pointer-events-auto">
                  {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              }
              className="bg-[#0f172a] border-white/10 text-white"
            />

            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button type="submit" className="w-full" size="lg" loading={busy}>
              دخول لوحة إدارة النظام
            </Button>
          </form>

          <div className="mt-6 space-y-3 text-center text-sm">
            <div className="rounded-xl bg-white/5 px-3 py-2 text-xs text-slate-400">
              تجريبي: admin@rafd.app / password123
            </div>
            <Link to="/login" className="block text-teal-300 hover:text-teal-200">
              ← العودة لتسجيل دخول المتجر
            </Link>
            {user && (
              <button
                type="button"
                className="text-xs text-slate-500 hover:text-slate-300"
                onClick={async () => {
                  await signOut();
                }}
              >
                إنهاء الجلسة الحالية
              </button>
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-[11px] leading-relaxed text-slate-500">
          لا يظهر رابط إدارة النظام داخل قائمة المتجر. الوصول فقط عبر هذه البوابة الخارجية.
        </p>
      </div>
    </div>
  );
}
