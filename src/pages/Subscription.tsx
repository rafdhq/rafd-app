import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  Clock3,
  CreditCard,
  Crown,
  Headphones,
  Mail,
  MessageCircle,
  Phone,
  ShieldCheck,
  Sparkles,
  Upload,
  Zap,
  AlertTriangle,
  CalendarDays,
  BadgeCheck,
  Building2,
} from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Dialog from '../components/ui/Dialog';
import { PageSkeleton } from '../components/ui/Skeleton';
import { SuccessToast } from '../components/ui/States';
import { useTenant } from '../contexts/TenantContext';
import { useSubscription } from '../contexts/SubscriptionContext';
import { useAuth } from '../contexts/AuthContext';
import { cn, formatDate, formatDateTime, formatMoney, shareWhatsApp } from '../lib/utils';
import { phaseLabel, statusTone } from '../lib/subscriptionAccess';

interface Plan {
  id: number;
  code: string;
  name: string;
  name_ar: string;
  description?: string | null;
  price_monthly: number;
  price_yearly: number;
  currency: string;
  trial_days: number;
  features: string[] | unknown;
  is_popular: boolean;
  is_active: boolean;
}

interface PayMethod {
  id: number;
  name_ar: string;
  name: string;
  provider?: string | null;
  account_name?: string | null;
  account_number?: string | null;
  instructions?: string | null;
  is_active: boolean;
}

function featuresList(f: Plan['features']): string[] {
  if (Array.isArray(f)) return f.map(String);
  return [];
}

async function fileToBase64(file: File) {
  const buffer = await file.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

const icons = [Zap, Sparkles, Crown];

export default function Subscription() {
  const { tenant } = useTenant();
  const { profile } = useAuth();
  const { data, loading: subLoading, refresh, canUseStore, daysRemaining, phase, deviceId } =
    useSubscription();
  const locked = !canUseStore;

  const [plans, setPlans] = useState<Plan[]>([]);
  const [payments, setPayments] = useState<PayMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [selectedPlan, setSelectedPlan] = useState<string>('');
  const [payOpen, setPayOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [payForm, setPayForm] = useState({
    payment_method_id: '',
    sender_name: '',
    reference: '',
    notes: '',
    amount: 0,
  });

  const settings = data?.settings;
  const subscription = data?.subscription;
  const pending = data?.pending_payments || [];

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    const [pRes, payRes] = await Promise.all([
      fetch('/api/subscription-plans?active=1'),
      fetch('/api/platform-payments?active=1'),
    ]);
    if (pRes.ok) {
      const list: Plan[] = await pRes.json();
      setPlans(list);
      setSelectedPlan((prev) => prev || tenant?.plan || list[0]?.code || 'growth');
    }
    if (payRes.ok) setPayments(await payRes.json());
    setLoading(false);
  }, [tenant?.plan]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    if (subscription?.plan_code) setSelectedPlan(subscription.plan_code);
    if (subscription?.billing_cycle === 'yearly') setCycle('yearly');
  }, [subscription?.plan_code, subscription?.billing_cycle]);

  const currentPlan = useMemo(
    () => plans.find((p) => p.code === (selectedPlan || subscription?.plan_code)) || null,
    [plans, selectedPlan, subscription?.plan_code]
  );

  const amount = useMemo(() => {
    if (!currentPlan) return 0;
    return cycle === 'yearly' ? Number(currentPlan.price_yearly) : Number(currentPlan.price_monthly);
  }, [currentPlan, cycle]);

  const endsAt = data?.access?.ends_at || subscription?.subscription_ends_at || subscription?.trial_ends_at;
  const progress = useMemo(() => {
    if (!endsAt || !subscription) return 0;
    const end = new Date(endsAt).getTime();
    const start = new Date(
      phase === 'trial' ? subscription.trial_starts_at || Date.now() : subscription.subscription_starts_at || Date.now()
    ).getTime();
    const total = Math.max(1, end - start);
    const left = Math.max(0, end - Date.now());
    return Math.min(100, Math.round((left / total) * 100));
  }, [endsAt, subscription, phase]);

  const choosePlan = async (code: string) => {
    if (!tenant?.id) return;
    setSelectedPlan(code);
    setBusy(true);
    try {
      await fetch('/api/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'select-plan',
          tenant_id: tenant.id,
          plan_code: code,
          billing_cycle: cycle,
        }),
      });
      await refresh();
      setToast('تم تحديد الباقة — أكمل الدفع لتفعيل الاشتراك');
    } finally {
      setBusy(false);
    }
  };

  const openPayment = async (code?: string) => {
    const planCode = code || selectedPlan || subscription?.plan_code;
    if (planCode && planCode !== selectedPlan) await choosePlan(planCode);
    setPayForm((f) => ({
      ...f,
      amount,
      sender_name: profile?.full_name || tenant?.name_ar || '',
      payment_method_id: payments[0] ? String(payments[0].id) : '',
    }));
    setProofUrl('');
    setPayOpen(true);
  };

  const uploadProof = async (file: File) => {
    setUploading(true);
    try {
      const fileBase64 = await fileToBase64(file);
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          fileBase64,
          contentType: file.type || 'image/png',
          folder: `subscriptions/${tenant?.id || 'tenant'}/proofs`,
        }),
      });
      if (!res.ok) throw new Error('upload failed');
      const json = await res.json();
      setProofUrl(json.url);
    } catch {
      alert('تعذر رفع إثبات التحويل');
    } finally {
      setUploading(false);
    }
  };

  const submitPayment = async () => {
    if (!tenant?.id) return;
    if (!proofUrl) {
      alert('يرجى رفع صورة/ملف إثبات التحويل');
      return;
    }
    setBusy(true);
    try {
      const method = payments.find((p) => String(p.id) === String(payForm.payment_method_id));
      const res = await fetch('/api/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'submit-payment',
          tenant_id: tenant.id,
          plan_code: selectedPlan || subscription?.plan_code,
          billing_cycle: cycle,
          amount: payForm.amount || amount,
          currency: currentPlan?.currency || 'YER',
          payment_method_id: payForm.payment_method_id ? Number(payForm.payment_method_id) : null,
          payment_method_name: method?.name_ar || method?.name || null,
          proof_url: proofUrl,
          sender_name: payForm.sender_name,
          reference: payForm.reference,
          notes: payForm.notes,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'فشل إرسال الطلب');
      }
      setPayOpen(false);
      setToast('تم إرسال إثبات التحويل — بانتظار مصادقة الإدارة');
      await refresh();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'خطأ');
    } finally {
      setBusy(false);
    }
  };

  const contactSupport = (channel: 'whatsapp' | 'phone' | 'email') => {
    const wa = settings?.support_whatsapp || '';
    const phone = settings?.support_phone || '';
    const email = settings?.support_email || '';
    const msg = `مرحباً رفد، أحتاج تفعيل اشتراك المتجر «${tenant?.name_ar || ''}»\nالجهاز: ${deviceId}\nالبريد: ${profile?.email || tenant?.email || ''}`;
    if (channel === 'whatsapp') shareWhatsApp(wa, msg);
    if (channel === 'phone' && phone) window.open(`tel:${phone}`);
    if (channel === 'email' && email) window.open(`mailto:${email}?subject=${encodeURIComponent('تفعيل اشتراك رفد')}&body=${encodeURIComponent(msg)}`);
  };

  if (loading || subLoading) return <PageSkeleton />;

  return (
    <div className={cn(locked && 'min-h-[70vh]')}>
      {toast && (
        <div className="mb-4">
          <SuccessToast title={toast} />
        </div>
      )}

      {locked && (
        <div className="mb-6 overflow-hidden rounded-3xl border border-danger/20 bg-gradient-to-l from-danger-soft via-surface to-warning-soft p-6 shadow-lift">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-danger text-white">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <div className="text-lg font-bold text-app">انتهت صلاحية الاستخدام</div>
                <p className="mt-1 max-w-2xl text-sm text-secondary">
                  {phase === 'trial_ended' || phase === 'expired'
                    ? 'انتهت الفترة التجريبية. اختر باقة وارفع إثبات التحويل ليتم تفعيل متجرك من الإدارة.'
                    : 'اشتراكك غير نشط حالياً. أكمل الدفع أو تواصل مع الدعم لاستعادة الوصول.'}
                </p>
              </div>
            </div>
            <Button size="lg" onClick={() => openPayment()}>
              <CreditCard className="h-4 w-4" />
              الاشتراك الآن
            </Button>
          </div>
        </div>
      )}

      <PageHeader
        title="الاشتراك والفوترة"
        description="إدارة باقتك · الفترة المتبقية · إثبات التحويل · تواصل احترافي مع رفد"
      />

      {/* Status hero */}
      <div className="mb-6 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2 overflow-hidden">
          <div className="relative">
            <div
              className="absolute inset-0 opacity-90"
              style={{
                background:
                  'radial-gradient(circle at 10% 20%, rgba(13,148,136,0.18), transparent 40%), radial-gradient(circle at 90% 80%, rgba(217,119,6,0.14), transparent 35%)',
              }}
            />
            <CardBody className="relative grid gap-5 md:grid-cols-[1.2fr_0.8fr]">
              <div>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Badge tone={statusTone(phase)} dot>
                    {phaseLabel(phase)}
                  </Badge>
                  {pending.length > 0 && (
                    <Badge tone="warning" dot>
                      {pending.length} طلب بانتظار المراجعة
                    </Badge>
                  )}
                </div>
                <h2 className="text-2xl font-bold tracking-tight text-app">
                  {tenant?.name_ar || 'متجرك'} · {currentPlan?.name_ar || subscription?.plan_code || '—'}
                </h2>
                <p className="mt-2 text-sm text-muted">
                  {canUseStore
                    ? `متبقي ${daysRemaining} يوماً على ${phase === 'trial' ? 'انتهاء التجربة' : 'تجديد الاشتراك'}`
                    : 'لا يمكن الوصول لصفحات المتجر حتى يتم التفعيل'}
                </p>

                <div className="mt-5">
                  <div className="mb-2 flex items-center justify-between text-xs text-muted">
                    <span>المتبقي</span>
                    <span className="tabular font-semibold text-app">{progress}%</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        progress > 30 ? 'bg-primary' : progress > 10 ? 'bg-warning' : 'bg-danger'
                      )}
                      style={{ width: `${canUseStore ? progress : 0}%` }}
                    />
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-app bg-surface/80 p-3">
                    <div className="flex items-center gap-2 text-xs text-muted">
                      <Clock3 className="h-3.5 w-3.5" /> الأيام المتبقية
                    </div>
                    <div className="mt-1 text-2xl font-bold tabular text-app">{daysRemaining}</div>
                  </div>
                  <div className="rounded-2xl border border-app bg-surface/80 p-3">
                    <div className="flex items-center gap-2 text-xs text-muted">
                      <CalendarDays className="h-3.5 w-3.5" /> تاريخ الانتهاء
                    </div>
                    <div className="mt-1 text-sm font-semibold text-app">{formatDate(endsAt)}</div>
                  </div>
                  <div className="rounded-2xl border border-app bg-surface/80 p-3">
                    <div className="flex items-center gap-2 text-xs text-muted">
                      <BadgeCheck className="h-3.5 w-3.5" /> دورة الفوترة
                    </div>
                    <div className="mt-1 text-sm font-semibold text-app">
                      {subscription?.billing_cycle === 'yearly' ? 'سنوي' : 'شهري'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-app bg-surface p-4 shadow-soft">
                <div className="text-xs font-semibold text-muted">ملخص الاشتراك</div>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="text-muted">الباقة</span>
                    <strong>{currentPlan?.name_ar || subscription?.plan_code}</strong>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted">الحالة</span>
                    <Badge tone={statusTone(phase)}>{phaseLabel(phase)}</Badge>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted">بداية التجربة</span>
                    <span>{formatDate(subscription?.trial_starts_at)}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted">نهاية التجربة</span>
                    <span>{formatDate(subscription?.trial_ends_at)}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted">آخر دفعة</span>
                    <span>{formatDate(subscription?.last_payment_at)}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted">مبلغ الباقة</span>
                    <span className="tabular font-semibold">
                      {formatMoney(amount || subscription?.amount || 0, currentPlan?.currency || 'YER')}
                    </span>
                  </div>
                </div>
                <Button className="mt-4 w-full" onClick={() => openPayment()}>
                  رفع إثبات التحويل
                </Button>
              </div>
            </CardBody>
          </div>
        </Card>

        <Card>
          <CardHeader title="تواصل مع إدارة رفد" description="دعم سريع لتفعيل الاشتراك" />
          <CardBody className="space-y-3">
            <button
              onClick={() => contactSupport('whatsapp')}
              className="flex w-full items-center gap-3 rounded-2xl border border-app bg-success-soft/40 px-4 py-3 text-start transition hover:shadow-soft"
            >
              <MessageCircle className="h-5 w-5 text-success" />
              <div>
                <div className="font-semibold text-app">واتساب الدعم</div>
                <div className="text-xs text-muted" dir="ltr">{settings?.support_whatsapp || '—'}</div>
              </div>
            </button>
            <button
              onClick={() => contactSupport('phone')}
              className="flex w-full items-center gap-3 rounded-2xl border border-app bg-info-soft/40 px-4 py-3 text-start transition hover:shadow-soft"
            >
              <Phone className="h-5 w-5 text-info" />
              <div>
                <div className="font-semibold text-app">اتصال</div>
                <div className="text-xs text-muted" dir="ltr">{settings?.support_phone || '—'}</div>
              </div>
            </button>
            <button
              onClick={() => contactSupport('email')}
              className="flex w-full items-center gap-3 rounded-2xl border border-app bg-primary-soft/40 px-4 py-3 text-start transition hover:shadow-soft"
            >
              <Mail className="h-5 w-5 text-primary" />
              <div>
                <div className="font-semibold text-app">البريد</div>
                <div className="text-xs text-muted">{settings?.support_email || '—'}</div>
              </div>
            </button>
            <div className="rounded-2xl bg-muted px-3 py-2 text-xs text-muted">
              <div className="mb-1 flex items-center gap-1 font-medium text-secondary">
                <ShieldCheck className="h-3.5 w-3.5" /> حماية الجهاز
              </div>
              لا يمكن فتح فترة تجريبية جديدة من هذا الجهاز. معرّف الجهاز:
              <div className="mt-1 break-all font-mono text-[10px]" dir="ltr">
                {deviceId}
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Billing cycle */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-app">الباقات المتاحة</h3>
          <p className="text-sm text-muted">اختر الباقة ثم ارفع إثبات التحويل لاعتماد الإدارة</p>
        </div>
        <div className="inline-flex rounded-2xl border border-app bg-muted p-1">
          <button
            className={cn(
              'rounded-xl px-4 py-2 text-sm font-medium',
              cycle === 'monthly' ? 'bg-surface text-app shadow-soft' : 'text-muted'
            )}
            onClick={() => setCycle('monthly')}
          >
            شهري
          </button>
          <button
            className={cn(
              'rounded-xl px-4 py-2 text-sm font-medium',
              cycle === 'yearly' ? 'bg-surface text-app shadow-soft' : 'text-muted'
            )}
            onClick={() => setCycle('yearly')}
          >
            سنوي
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {plans.map((p, idx) => {
          const Icon = icons[idx % icons.length];
          const active = (selectedPlan || subscription?.plan_code) === p.code;
          const price = cycle === 'yearly' ? p.price_yearly : p.price_monthly;
          return (
            <Card key={p.id} className={cn('relative overflow-hidden', p.is_popular && 'border-primary shadow-lift', active && 'ring-2 ring-[var(--ring)]')}>
              {p.is_popular && (
                <div className="absolute left-4 top-4">
                  <Badge tone="accent">الأكثر اختياراً</Badge>
                </div>
              )}
              <CardBody className="flex h-full flex-col">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                  <Icon className="h-6 w-6" />
                </div>
                <div className="text-sm text-muted">{p.name}</div>
                <div className="text-2xl font-bold text-app">{p.name_ar}</div>
                {p.description && <p className="mt-1 text-sm text-muted">{p.description}</p>}
                <div className="mt-3 flex items-end gap-1">
                  <span className="text-3xl font-bold tabular text-primary">
                    {formatMoney(price, p.currency || 'YER')}
                  </span>
                  <span className="mb-1 text-sm text-muted">/ {cycle === 'yearly' ? 'سنة' : 'شهر'}</span>
                </div>
                <div className="mt-1 text-xs text-muted">تجربة {p.trial_days} يوم · تفعيل بعد اعتماد التحويل</div>
                <ul className="mt-5 flex-1 space-y-2">
                  {featuresList(p.features).map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-secondary">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                      {f}
                    </li>
                  ))}
                </ul>
                <div className="mt-6 grid gap-2">
                  <Button
                    className="w-full"
                    variant={active ? 'soft' : 'primary'}
                    loading={busy && selectedPlan === p.code}
                    onClick={() => choosePlan(p.code)}
                  >
                    {active ? 'الباقة المحددة' : 'اختيار الباقة'}
                  </Button>
                  <Button className="w-full" variant="outline" onClick={() => openPayment(p.code)}>
                    <Upload className="h-4 w-4" />
                    ادفع وارفَع الإثبات
                  </Button>
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="حسابات التحويل" description="حوّل ثم ارفع صورة الإشعار" />
          <CardBody className="space-y-3">
            {payments.map((p) => (
              <div key={p.id} className="rounded-2xl border border-app bg-subtle p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-app">{p.name_ar || p.name}</div>
                    <div className="text-sm text-muted">
                      {p.provider} · {p.account_name}
                    </div>
                    <div className="mt-1 font-mono text-xs" dir="ltr">
                      {p.account_number || '—'}
                    </div>
                    {p.instructions && <p className="mt-2 text-xs text-secondary">{p.instructions}</p>}
                  </div>
                </div>
              </div>
            ))}
            {!payments.length && <div className="text-sm text-muted">لا توجد طرق دفع مفعّلة حالياً</div>}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="طلبات الدفع الأخيرة" />
          <CardBody className="space-y-2">
            {pending.length === 0 && (
              <div className="rounded-2xl border border-dashed border-app py-10 text-center text-sm text-muted">
                لا توجد طلبات معلّقة
              </div>
            )}
            {(pending as Array<Record<string, unknown>>).map((p) => (
              <div key={String(p.id)} className="rounded-2xl border border-app px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium text-app">{String(p.plan_code)}</div>
                  <Badge tone="warning">{String(p.status)}</Badge>
                </div>
                <div className="mt-1 text-sm text-muted">
                  {formatMoney(Number(p.amount || 0), String(p.currency || 'YER'))} ·{' '}
                  {formatDateTime(String(p.created_at || ''))}
                </div>
                {!!p.proof_url && (
                  <a className="mt-2 inline-block text-xs text-primary underline" href={String(p.proof_url)} target="_blank" rel="noreferrer">
                    عرض الإثبات
                  </a>
                )}
              </div>
            ))}
            <div className="rounded-2xl bg-muted p-3 text-xs text-secondary">
              <Headphones className="mb-1 inline h-3.5 w-3.5" /> بعد اعتماد الإدارة يتم فتح صلاحية الاستخدام تلقائياً
              لجميع صفحات المتجر.
            </div>
          </CardBody>
        </Card>
      </div>

      <Dialog
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title="رفع إثبات تحويل الاشتراك"
        description={`${currentPlan?.name_ar || ''} · ${formatMoney(amount, currentPlan?.currency || 'YER')} / ${cycle === 'yearly' ? 'سنة' : 'شهر'}`}
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setPayOpen(false)}>
              إلغاء
            </Button>
            <Button loading={busy} onClick={submitPayment}>
              إرسال للمراجعة
            </Button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label="طريقة التحويل"
            value={payForm.payment_method_id}
            onChange={(e) => setPayForm({ ...payForm, payment_method_id: e.target.value })}
            options={payments.map((p) => ({ value: String(p.id), label: p.name_ar || p.name }))}
            placeholder="اختر الحساب"
          />
          <Input
            label="المبلغ المحوّل"
            type="number"
            value={payForm.amount || amount}
            onChange={(e) => setPayForm({ ...payForm, amount: Number(e.target.value) || 0 })}
          />
          <Input
            label="اسم المحوّل"
            value={payForm.sender_name}
            onChange={(e) => setPayForm({ ...payForm, sender_name: e.target.value })}
          />
          <Input
            label="رقم العملية / المرجع"
            value={payForm.reference}
            onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })}
          />
          <div className="sm:col-span-2">
            <Input
              label="ملاحظات"
              value={payForm.notes}
              onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2 rounded-2xl border border-dashed border-app p-4">
            <div className="mb-2 text-sm font-medium text-secondary">إثبات التحويل (صورة أو PDF)</div>
            <label className="inline-flex cursor-pointer">
              <span className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-inverse">
                <Upload className="h-4 w-4" />
                {uploading ? 'جاري الرفع...' : 'اختيار ملف'}
              </span>
              <input
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadProof(f);
                }}
              />
            </label>
            {proofUrl && (
              <div className="mt-3 text-xs text-success break-all">
                تم الرفع: <a href={proofUrl} className="underline" target="_blank" rel="noreferrer">{proofUrl}</a>
              </div>
            )}
          </div>
        </div>
      </Dialog>
    </div>
  );
}
