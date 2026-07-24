import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Building2,
  Check,
  Eye,
  EyeOff,
  Layers,
  Lock,
  Mail,
  Palette,
  Store,
  User,
} from 'lucide-react';
import Logo from '../components/brand/Logo';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import { cn } from '../lib/utils';
import {
  BUSINESS_TYPES,
  defaultCategoriesForBusiness,
  getBusinessType,
} from '../lib/catalog';
import supabase from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { checkDeviceTrialBlocked, getDeviceId } from '../lib/device';

const steps = [
  { id: 1, title: 'المتجر', icon: Store },
  { id: 2, title: 'النشاط', icon: Layers },
  { id: 3, title: 'الهوية', icon: Palette },
  { id: 4, title: 'الفرع', icon: Building2 },
  { id: 5, title: 'حساب المالك', icon: User },
];

const presets = [
  { name: 'Teal Growth', primary: '#0d9488', secondary: '#d97706' },
  { name: 'Deep Navy', primary: '#1d4ed8', secondary: '#f59e0b' },
  { name: 'Emerald', primary: '#059669', secondary: '#7c3aed' },
  { name: 'Sand Gold', primary: '#b45309', secondary: '#0f766e' },
];

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export default function Onboarding() {
  const navigate = useNavigate();
  const location = useLocation();
  const { refreshProfile } = useAuth();
  const prefill = (location.state as { prefillEmail?: string; prefillName?: string } | null) || null;
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showPass, setShowPass] = useState(false);
  const [showPass2, setShowPass2] = useState(false);
  const [form, setForm] = useState({
    name: '',
    name_ar: '',
    currency: 'YER',
    phone: '',
    email: '',
    address: '',
    primary_color: '#0d9488',
    secondary_color: '#d97706',
    branch_name: 'Main Branch',
    branch_name_ar: 'الفرع الرئيسي',
    owner_name: prefill?.prefillName || '',
    owner_email: prefill?.prefillEmail || '',
    owner_password: '',
    owner_password_confirm: '',
    plan: 'growth',
    business_type: 'grocery',
  });

  useEffect(() => {
    if (!prefill) return;
    setForm((f) => ({
      ...f,
      owner_email: prefill.prefillEmail || f.owner_email,
      owner_name: prefill.prefillName || f.owner_name,
      email: prefill.prefillEmail || f.email,
    }));
    // If coming from login signup intent, jump near account step after store basics
  }, [prefill?.prefillEmail, prefill?.prefillName]);

  const set = (k: keyof typeof form, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setFieldErrors((fe) => {
      if (!fe[k]) return fe;
      const next = { ...fe };
      delete next[k];
      return next;
    });
  };

  const business = useMemo(() => getBusinessType(form.business_type), [form.business_type]);
  const cats = useMemo(() => defaultCategoriesForBusiness(form.business_type), [form.business_type]);

  const validateStep = (s: number) => {
    const errs: Record<string, string> = {};
    if (s === 1) {
      if (!form.name_ar.trim() && !form.name.trim()) errs.name_ar = 'اسم المتجر مطلوب';
      if (!form.currency) errs.currency = 'اختر العملة';
    }
    if (s === 2) {
      if (!form.business_type) errs.business_type = 'اختر نوع النشاط';
    }
    if (s === 4) {
      if (!form.branch_name_ar.trim() && !form.branch_name.trim()) {
        errs.branch_name_ar = 'اسم الفرع مطلوب';
      }
    }
    if (s === 5) {
      if (!form.owner_name.trim()) errs.owner_name = 'اسم المالك مطلوب';
      if (!form.owner_email.trim()) errs.owner_email = 'البريد مطلوب';
      else if (!isValidEmail(form.owner_email)) errs.owner_email = 'بريد غير صالح';
      if (!form.owner_password) errs.owner_password = 'كلمة المرور مطلوبة';
      else if (form.owner_password.length < 6) errs.owner_password = '6 أحرف على الأقل';
      if (!form.owner_password_confirm) errs.owner_password_confirm = 'أكد كلمة المرور';
      else if (form.owner_password !== form.owner_password_confirm) {
        errs.owner_password_confirm = 'كلمتا المرور غير متطابقتين';
      }
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const goNext = () => {
    setError('');
    if (!validateStep(step)) return;
    // Sync store email into owner email if empty
    if (step === 1 && form.email && !form.owner_email) {
      setForm((f) => ({ ...f, owner_email: f.email }));
    }
    setStep((s) => Math.min(5, s + 1));
  };

  const finish = async () => {
    setError('');
    if (!validateStep(5)) return;

    setBusy(true);
    let createdTenantId: number | null = null;
    try {
      const ownerEmail = form.owner_email.trim().toLowerCase();
      const storeNameAr = form.name_ar.trim() || form.name.trim();
      const storeNameEn = form.name.trim() || form.name_ar.trim();
      const branchAr = form.branch_name_ar.trim() || form.branch_name.trim() || 'الفرع الرئيسي';
      const branchEn = form.branch_name.trim() || form.branch_name_ar.trim() || 'Main Branch';
      const deviceId = getDeviceId();

      // Device anti-abuse: one free trial per device
      const deviceCheck = await checkDeviceTrialBlocked(deviceId);
      if (deviceCheck.blocked) {
        const wa =
          (await fetch('/api/platform-settings').then((r) => (r.ok ? r.json() : null)).catch(() => null))
            ?.support_whatsapp || '';
        throw new Error(
          `هذا الجهاز استخدم فترة تجريبية مسبقاً${
            deviceCheck.binding?.store_name ? ` (متجر: ${deviceCheck.binding.store_name})` : ''
          }. لا يمكن إنشاء متجر جديد بفترة مجانية من نفس الجهاز. تواصل مع الإدارة للتفعيل${
            wa ? ` عبر واتساب ${wa}` : ''
          }.`
        );
      }

      // 1) Create auth account (or sign in if email already registered with same password)
      let sessionUser: { id: string; email?: string | null } | null = null;
      let session: unknown = null;

      const { data: authData, error: signUpErr } = await supabase.auth.signUp({
        email: ownerEmail,
        password: form.owner_password,
        options: {
          data: {
            full_name: form.owner_name.trim(),
          },
        },
      });

      if (signUpErr) {
        const msg = signUpErr.message || '';
        if (/already|registered|exists/i.test(msg)) {
          const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
            email: ownerEmail,
            password: form.owner_password,
          });
          if (signInErr) {
            throw new Error(
              'هذا البريد مسجّل مسبقاً بكلمة مرور مختلفة. سجّل الدخول أو استخدم بريداً آخر.'
            );
          }
          session = signInData.session;
          sessionUser = signInData.user;
        } else if (/password/i.test(msg)) {
          throw new Error('كلمة المرور ضعيفة. استخدم 6 أحرف على الأقل.');
        } else {
          throw new Error(msg || 'تعذر إنشاء حساب الدخول');
        }
      } else {
        sessionUser = authData.user;
        session = authData.session;
        if (!session) {
          const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
            email: ownerEmail,
            password: form.owner_password,
          });
          if (!signInErr) {
            session = signInData.session;
            sessionUser = signInData.user;
          }
        }
      }

      // 2) Create tenant
      const tRes = await fetch('/api/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: storeNameEn,
          name_ar: storeNameAr,
          currency: form.currency,
          phone: form.phone || null,
          email: form.email.trim() || ownerEmail,
          address: form.address || null,
          primary_color: form.primary_color,
          secondary_color: form.secondary_color,
          plan: form.plan,
          status: 'trial',
          business_type: form.business_type,
          enabled_categories: defaultCategoriesForBusiness(form.business_type),
          custom_categories: [],
          invoice_footer: `شكراً لتسوقكم في ${storeNameAr}`,
        }),
      });
      if (!tRes.ok) {
        const errBody = await tRes.json().catch(() => ({}));
        throw new Error(errBody.error || 'تعذر إنشاء المتجر');
      }
      const tenant = await tRes.json();
      createdTenantId = tenant.id;

      // 3) Start trial + bind device (must succeed before continuing)
      const trialRes = await fetch('/api/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'init-trial',
          tenant_id: tenant.id,
          plan_code: form.plan || 'growth',
          device_id: deviceId,
          owner_email: ownerEmail,
          owner_name: form.owner_name.trim(),
          store_name: storeNameAr,
        }),
      });
      if (!trialRes.ok) {
        const errBody = await trialRes.json().catch(() => ({}));
        if (errBody.code === 'DEVICE_TRIAL_USED') {
          throw new Error(
            errBody.error ||
              'هذا الجهاز مرتبط بفترة تجريبية سابقة. تواصل مع الإدارة للتفعيل.'
          );
        }
        throw new Error(errBody.error || 'فشل إنشاء الاشتراك التجريبي — لا يمكن إنشاء متجر بدون اشتراك');
      }

      // 4) Main branch
      const bRes = await fetch('/api/branches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenant.id,
          name: branchEn,
          name_ar: branchAr,
          address: form.address || null,
          phone: form.phone || null,
          is_main: true,
          status: 'active',
        }),
      });
      let branchId: number | null = null;
      if (bRes.ok) {
        const branch = await bRes.json();
        branchId = branch.id;
      }

      // 4) Owner profile linked to THIS tenant (not demo tenant 1)
      const existingProfileRes = await fetch(`/api/users?email=${encodeURIComponent(ownerEmail)}`);
      const existingProfiles = existingProfileRes.ok ? await existingProfileRes.json() : [];
      const existing = Array.isArray(existingProfiles) ? existingProfiles[0] : null;

      if (existing?.id) {
        await fetch('/api/users', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: existing.id,
            tenant_id: tenant.id,
            full_name: form.owner_name.trim(),
            role: 'owner',
            phone: form.phone || null,
            branch_id: branchId,
            status: 'active',
            auth_id: sessionUser?.id || existing.auth_id || null,
          }),
        });
      } else {
        const uRes = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenant_id: tenant.id,
            auth_id: sessionUser?.id || null,
            email: ownerEmail,
            full_name: form.owner_name.trim(),
            role: 'owner',
            phone: form.phone || null,
            branch_id: branchId,
            status: 'active',
          }),
        });
        if (!uRes.ok) {
          const errBody = await uRes.json().catch(() => ({}));
          throw new Error(errBody.error || 'تعذر إنشاء ملف المالك');
        }
      }

      // 5) Sync status seed
      await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenant.id }),
      });

      // 7) Welcome notification
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenant.id,
          title: 'مرحباً بك في رفد',
          body: `تم إنشاء متجر «${storeNameAr}» وبدأت فترتك التجريبية. عند انتهائها اختر باقة وارفع إثبات التحويل للتفعيل.`,
          type: 'success',
        }),
      });

      // Ensure session + profile
      if (!session) {
        await supabase.auth.signInWithPassword({
          email: ownerEmail,
          password: form.owner_password,
        });
      }
      await refreshProfile();

      const {
        data: { session: finalSession },
      } = await supabase.auth.getSession();

      if (finalSession) {
        navigate('/dashboard', { replace: true });
      } else {
        // Email confirmation may be required
        navigate('/login', {
          replace: true,
          state: {
            notice: 'تم إنشاء المتجر. سجّل الدخول ببريدك وكلمة المرور.',
            email: ownerEmail,
          },
        });
      }
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'حدث خطأ أثناء الإعداد');
      // best-effort: if tenant created but later steps failed, still useful
      if (createdTenantId) {
        setError(
          (err instanceof Error ? err.message : 'حدث خطأ') +
            ` (تم إنشاء المتجر #${createdTenantId} — يمكنك إكمال الدخول من صفحة تسجيل الدخول)`
        );
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh bg-app safe-pt safe-px safe-pb" dir="rtl">
      <div className="mx-auto w-full max-w-3xl px-3 py-6 sm:px-4 sm:py-10 page-container">
        <div className="mb-8 flex items-center justify-between">
          <Logo size="md" />
          <Button variant="ghost" onClick={() => navigate('/login')}>
            لدي حساب
          </Button>
        </div>

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-app">إعداد متجرك على رفد</h1>
          <p className="mt-2 text-muted">
            أنشئ المتجر وحساب المالك بكلمة مرور — ثم ادخل مباشرة إلى لوحة التحكم
          </p>
        </div>

        <div className="mb-8 flex gap-2 overflow-x-auto pb-1">
          {steps.map((s) => {
            const Icon = s.icon;
            const active = step === s.id;
            const done = step > s.id;
            return (
              <div
                key={s.id}
                className={cn(
                  'flex min-w-[4.5rem] flex-1 items-center gap-2 rounded-2xl border px-3 py-3 text-sm',
                  active && 'border-primary bg-primary-soft text-primary',
                  done && 'border-app bg-surface text-success',
                  !active && !done && 'border-app bg-surface text-muted'
                )}
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-surface">
                  {done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </div>
                <span className="hidden font-medium sm:inline">{s.title}</span>
              </div>
            );
          })}
        </div>

        <div className="rounded-3xl border border-app bg-surface p-6 shadow-soft">
          {step === 1 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="اسم المتجر (عربي)"
                value={form.name_ar}
                onChange={(e) => set('name_ar', e.target.value)}
                error={fieldErrors.name_ar}
                placeholder="مثال: بقالة النور"
                required
              />
              <Input
                label="Store name (EN)"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="Al Noor Grocery"
              />
              <Select
                label="العملة"
                value={form.currency}
                onChange={(e) => set('currency', e.target.value)}
                options={[
                  { value: 'YER', label: 'ريال يمني (YER)' },
                  { value: 'SAR', label: 'ريال سعودي (SAR)' },
                  { value: 'USD', label: 'دولار (USD)' },
                ]}
              />
              <Select
                label="الخطة"
                value={form.plan}
                onChange={(e) => set('plan', e.target.value)}
                options={[
                  { value: 'starter', label: 'Starter' },
                  { value: 'growth', label: 'Growth' },
                  { value: 'enterprise', label: 'Enterprise' },
                ]}
              />
              <Input
                label="جوال المتجر"
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                placeholder="+9677xxxxxxx"
              />
              <Input
                label="بريد المتجر (اختياري)"
                type="email"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                placeholder="store@example.com"
              />
              <div className="sm:col-span-2">
                <Input
                  label="العنوان"
                  value={form.address}
                  onChange={(e) => set('address', e.target.value)}
                  placeholder="المدينة، الحي، الشارع"
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-muted">
                اختر نوع النشاط ليتم تفعيل فئات المنتجات المناسبة. يمكنك توسيع الفئات لاحقاً من الإعدادات.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {BUSINESS_TYPES.map((b) => {
                  const active = form.business_type === b.id;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => set('business_type', b.id)}
                      className={cn(
                        'rounded-2xl border p-4 text-start transition',
                        active ? 'border-primary bg-primary-soft' : 'border-app hover:border-strong'
                      )}
                    >
                      <div className="font-semibold text-app">{b.label}</div>
                      <div className="text-xs text-muted">{b.labelEn}</div>
                      <p className="mt-2 text-sm text-secondary">{b.description}</p>
                    </button>
                  );
                })}
              </div>
              <div className="rounded-2xl bg-muted px-4 py-3 text-sm text-secondary">
                <strong className="text-app">{business.label}:</strong> سيُفعَّل {cats.length} فئة افتراضياً (
                {cats.slice(0, 8).join('، ')}
                {cats.length > 8 ? '...' : ''})
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <p className="text-sm text-muted">اختر ألوان علامتك — ستظهر على الفواتير وواجهة الفريق</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {presets.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => {
                      set('primary_color', p.primary);
                      set('secondary_color', p.secondary);
                    }}
                    className={cn(
                      'flex items-center gap-3 rounded-2xl border p-4 text-start transition',
                      form.primary_color === p.primary
                        ? 'border-primary ring-primary'
                        : 'border-app hover:border-strong'
                    )}
                  >
                    <div className="flex -space-x-2 space-x-reverse">
                      <span className="h-8 w-8 rounded-full border-2 border-white" style={{ background: p.primary }} />
                      <span className="h-8 w-8 rounded-full border-2 border-white" style={{ background: p.secondary }} />
                    </div>
                    <div>
                      <div className="font-medium text-app">{p.name}</div>
                      <div className="text-xs text-muted">
                        {p.primary} · {p.secondary}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              <div
                className="rounded-2xl p-5 text-white"
                style={{ background: `linear-gradient(135deg, ${form.primary_color}, ${form.secondary_color})` }}
              >
                <div className="text-sm opacity-80">معاينة العلامة</div>
                <div className="mt-1 text-2xl font-bold">{form.name_ar || 'اسم المتجر'}</div>
                <div className="mt-1 text-sm opacity-90">{business.label}</div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="اسم الفرع (عربي)"
                value={form.branch_name_ar}
                onChange={(e) => set('branch_name_ar', e.target.value)}
                error={fieldErrors.branch_name_ar}
              />
              <Input
                label="Branch name"
                value={form.branch_name}
                onChange={(e) => set('branch_name', e.target.value)}
              />
              <div className="sm:col-span-2 rounded-2xl bg-muted p-4 text-sm text-secondary">
                يمكنك إضافة فروع إضافية لاحقاً من شاشة الفروع. كل فرع يمكنه العمل بنقطة بيع مستقلة.
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-primary/20 bg-primary-soft/40 px-4 py-3 text-sm text-secondary">
                أنشئ حساب دخول المالك. ستستخدم هذا البريد وكلمة المرور لتسجيل الدخول إلى رفد.
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="اسم المالك"
                  value={form.owner_name}
                  onChange={(e) => set('owner_name', e.target.value)}
                  error={fieldErrors.owner_name}
                  rightIcon={<User className="h-4 w-4" />}
                  placeholder="الاسم الكامل"
                  required
                />
                <Input
                  label="بريد الدخول"
                  type="email"
                  value={form.owner_email}
                  onChange={(e) => set('owner_email', e.target.value)}
                  error={fieldErrors.owner_email}
                  rightIcon={<Mail className="h-4 w-4" />}
                  placeholder="owner@store.com"
                  autoComplete="username"
                  required
                />
                <Input
                  label="كلمة المرور"
                  type={showPass ? 'text' : 'password'}
                  value={form.owner_password}
                  onChange={(e) => set('owner_password', e.target.value)}
                  error={fieldErrors.owner_password}
                  rightIcon={<Lock className="h-4 w-4" />}
                  leftIcon={
                    <button
                      type="button"
                      onClick={() => setShowPass((v) => !v)}
                      className="pointer-events-auto"
                      aria-label="إظهار كلمة المرور"
                    >
                      {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  }
                  placeholder="6 أحرف على الأقل"
                  autoComplete="new-password"
                  required
                />
                <Input
                  label="تأكيد كلمة المرور"
                  type={showPass2 ? 'text' : 'password'}
                  value={form.owner_password_confirm}
                  onChange={(e) => set('owner_password_confirm', e.target.value)}
                  error={fieldErrors.owner_password_confirm}
                  rightIcon={<Lock className="h-4 w-4" />}
                  leftIcon={
                    <button
                      type="button"
                      onClick={() => setShowPass2((v) => !v)}
                      className="pointer-events-auto"
                      aria-label="إظهار التأكيد"
                    >
                      {showPass2 ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  }
                  placeholder="أعد كتابة كلمة المرور"
                  autoComplete="new-password"
                  required
                />
              </div>

              <div className="rounded-2xl border border-app bg-subtle p-4">
                <div className="font-medium text-app">ملخص الإعداد</div>
                <ul className="mt-2 space-y-1 text-sm text-muted">
                  <li>• متجر: {form.name_ar || form.name || '—'}</li>
                  <li>• النشاط: {business.label}</li>
                  <li>• الفئات الافتراضية: {cats.length}</li>
                  <li>• فرع: {form.branch_name_ar || form.branch_name}</li>
                  <li>• العملة: {form.currency}</li>
                  <li>• بريد الدخول: {form.owner_email || '—'}</li>
                </ul>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-xl border border-[var(--danger)]/30 bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </div>
          )}

          <div className="mt-8 flex items-center justify-between gap-3">
            <Button variant="ghost" disabled={step === 1 || busy} onClick={() => setStep((s) => s - 1)}>
              السابق
            </Button>
            {step < 5 ? (
              <Button onClick={goNext}>التالي</Button>
            ) : (
              <Button loading={busy} onClick={finish}>
                إنشاء المتجر والحساب
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
