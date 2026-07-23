import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, Mail, ShieldCheck, Store } from 'lucide-react';
import Logo from '../components/brand/Logo';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { useAuth } from '../contexts/AuthContext';
import supabase from '../lib/supabase';
import { signInWithGoogle } from '../lib/googleAuth';
import { useTheme } from '../contexts/ThemeContext';

export default function Login() {
  const { user, profile, loading, refreshProfile } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const noticeFromState = (location.state as { notice?: string; email?: string } | null)?.notice;
  const emailFromState = (location.state as { notice?: string; email?: string } | null)?.email;
  const [email, setEmail] = useState(emailFromState || '');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(noticeFromState || '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (emailFromState) setEmail(emailFromState);
    if (noticeFromState) setNotice(noticeFromState);
    const invite = new URLSearchParams(window.location.search).get('invite');
    if (invite) {
      setNotice('لديك دعوة انضمام — سجّل الدخول بنفس بريد الدعوة لقبولها');
      fetch(`/api/invites?token=${encodeURIComponent(invite)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.email) setEmail(data.email);
        })
        .catch(() => undefined);
    }
  }, [emailFromState, noticeFromState]);

  // A pure platform super-admin (no store) goes to the admin console.
  // A super-admin who also owns a store is Owner + Super Admin → runs the store.
  if (!loading && user && profile?.role === 'superadmin' && !profile?.tenant_id) {
    return <Navigate to="/admin" replace />;
  }
  if (!loading && user) return <Navigate to="/dashboard" replace />;

  const resolvePostLogin = async (authEmail: string) => {
    const res = await fetch(`/api/users?email=${encodeURIComponent(authEmail)}`);
    if (res.ok) {
      const rows = await res.json();
      const p = Array.isArray(rows) ? rows[0] : rows;
      if (p?.role === 'superadmin' && !p?.tenant_id) {
        navigate('/admin');
        return;
      }
    }
    navigate('/dashboard');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const { data, error: err } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (err) throw err;

      // Accept pending invite if present in URL
      const inviteToken = new URLSearchParams(window.location.search).get('invite');
      if (inviteToken) {
        await fetch('/api/invites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'accept', token: inviteToken }),
        });
        window.history.replaceState({}, '', '/login');
      }

      await refreshProfile();
      await resolvePostLogin(data.user?.email || email);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'فشل تسجيل الدخول');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh bg-app safe-pt safe-px safe-pb" dir="rtl">
      <div className="grid min-h-dvh lg:grid-cols-2">
        <div className="relative hidden overflow-hidden bg-[#042f2e] lg:flex lg:flex-col lg:justify-between p-8 xl:p-10 text-white">
          <div className="absolute inset-0 opacity-40" style={{
            background:
              'radial-gradient(circle at 20% 20%, rgba(45,212,191,0.35), transparent 40%), radial-gradient(circle at 80% 70%, rgba(251,191,36,0.25), transparent 35%)',
          }} />
          <div className="relative z-10">
            <Logo inverted size="lg" />
          </div>
          <div className="relative z-10 max-w-lg">
            <h1 className="text-4xl font-bold leading-tight tracking-tight">
              منصة إدارة البقالة
              <br />
              <span className="text-teal-300">الأذكى والأسرع</span>
            </h1>
            <p className="mt-4 text-lg text-teal-100/80 leading-relaxed">
              رفد منصة Offline-First مصممة لليمن والسعودية. نقطة بيع لمسية، مخزون لحظي،
              ومزامنة سحابية موثوقة — بدون تعقيد محاسبي.
            </p>
            <div className="mt-8 grid grid-cols-3 gap-3">
              {[
                { t: 'Offline First', d: 'يعمل بدون إنترنت' },
                { t: 'RTL First', d: 'عربي أصلي' },
                { t: 'Touch First', d: 'جاهز للمس' },
              ].map((x) => (
                <div key={x.t} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-sm font-semibold text-teal-200">{x.t}</div>
                  <div className="mt-1 text-xs text-teal-100/70">{x.d}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="relative z-10 text-sm text-teal-200/60">
            © {new Date().getFullYear()} رفد | RAFD — Trust · Speed · Growth
          </div>
        </div>

        <div className="flex flex-col justify-center px-4 py-8 sm:px-8 sm:py-10 lg:px-10">
          <div className="mx-auto w-full max-w-md min-w-0">
            <div className="mb-8 flex items-center justify-between lg:hidden">
              <Logo size="md" />
              <button onClick={toggleTheme} className="text-sm text-muted">
                {theme === 'dark' ? 'فاتح' : 'داكن'}
              </button>
            </div>

            <div className="mb-8">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary">
                <ShieldCheck className="h-3.5 w-3.5" />
                آمن · متعدد المستأجرين · جاهز للإنتاج
              </div>
              <h2 className="text-2xl font-bold text-app">تسجيل الدخول</h2>
              <p className="mt-1.5 text-sm text-muted">ادخل إلى لوحة رفد لمتجرك</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="البريد الإلكتروني"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                rightIcon={<Mail className="h-4 w-4" />}
                placeholder="you@store.com"
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
                placeholder="••••••••"
              />

              {notice && (
                <div className="rounded-xl border border-primary/20 bg-primary-soft px-3 py-2 text-sm text-primary">
                  {notice}
                </div>
              )}

              {error && (
                <div className="rounded-xl border border-[var(--danger)]/30 bg-danger-soft px-3 py-2 text-sm text-danger">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full" size="lg" loading={busy}>
                دخول
              </Button>
            </form>

            <div className="my-5 flex items-center gap-3 text-xs text-muted">
              <div className="h-px flex-1 bg-[var(--border)]" />
              أو
              <div className="h-px flex-1 bg-[var(--border)]" />
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              size="lg"
              onClick={() => signInWithGoogle('رفد | RAFD')}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path fill="#EA4335" d="M12 10.2v3.6h5.1c-.2 1.2-1.5 3.6-5.1 3.6-3.1 0-5.6-2.5-5.6-5.6S8.9 6.2 12 6.2c1.8 0 3 .7 3.7 1.4l2.5-2.4C16.8 3.8 14.6 3 12 3 7 3 3 7 3 12s4 9 9 9c5.2 0 8.6-3.6 8.6-8.7 0-.6-.1-1-.2-1.5H12z" />
              </svg>
              المتابعة عبر Google
            </Button>

            <div className="mt-8 rounded-2xl border border-app bg-surface p-4 text-center">
              <p className="text-sm text-muted">ليس لديك متجر بعد؟</p>
              <Link
                to="/onboarding"
                className="mt-2 inline-flex items-center justify-center gap-2 text-sm font-semibold text-primary"
              >
                <Store className="h-4 w-4" />
                إنشاء متجر جديد
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
