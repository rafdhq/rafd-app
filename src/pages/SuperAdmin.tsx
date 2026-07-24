import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Bell,
  Building2,
  CreditCard,
  Crown,
  ImagePlus,
  Megaphone,
  Package,
  Pencil,
  Plus,
  Settings2,
  Shield,
  Trash2,
  Users,
} from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import StatCard from '../components/ui/StatCard';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Table, THead, TH, TBody, TD } from '../components/ui/Table';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Dialog from '../components/ui/Dialog';
import Tabs from '../components/ui/Tabs';
import { PageSkeleton } from '../components/ui/Skeleton';
import { SuccessToast, ErrorState } from '../components/ui/States';
import type { AppUser, Tenant } from '../lib/types';
import { cn, formatDate, formatMoney } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';

interface PlatformSettings {
  id?: number;
  app_name: string;
  app_name_ar: string;
  logo_url?: string | null;
  favicon_url?: string | null;
  primary_color: string;
  secondary_color: string;
  support_email: string;
  support_phone: string;
  support_whatsapp: string;
  website: string;
  address: string;
  trial_days: number;
  default_currency: string;
  invoice_footer: string;
  maintenance_mode: boolean;
  allow_registration: boolean;
}

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
  max_branches: number;
  max_users: number;
  max_products: number;
  features: string[] | unknown;
  is_popular: boolean;
  is_active: boolean;
  sort_order: number;
}

interface PayMethod {
  id: number;
  name: string;
  name_ar: string;
  type: string;
  provider?: string | null;
  account_name?: string | null;
  account_number?: string | null;
  iban?: string | null;
  instructions?: string | null;
  is_active: boolean;
  sort_order: number;
}

interface Announcement {
  id: number;
  title: string;
  body: string;
  type: string;
  audience: string;
  is_published: boolean;
  publish_at?: string | null;
  created_at?: string;
}

async function fileToBase64(file: File) {
  const buffer = await file.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function featuresList(f: Plan['features']): string[] {
  if (Array.isArray(f)) return f.map(String);
  if (typeof f === 'string') {
    try {
      const parsed = JSON.parse(f);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return f.split('\\n').filter(Boolean);
    }
  }
  return [];
}

const emptyPlan = {
  code: '',
  name: '',
  name_ar: '',
  description: '',
  price_monthly: 0,
  price_yearly: 0,
  currency: 'YER',
  trial_days: 14,
  max_branches: 1,
  max_users: 5,
  max_products: 2000,
  featuresText: '',
  is_popular: false,
  is_active: true,
  sort_order: 0,
};

const emptyPay = {
  name: '',
  name_ar: '',
  type: 'bank',
  provider: '',
  account_name: '',
  account_number: '',
  iban: '',
  instructions: '',
  is_active: true,
  sort_order: 0,
};

export default function SuperAdmin() {
  const { profile } = useAuth();
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [payments, setPayments] = useState<PayMethod[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  const [subscriberQ, setSubscriberQ] = useState('');
  const [planOpen, setPlanOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [planForm, setPlanForm] = useState(emptyPlan);
  const [payOpen, setPayOpen] = useState(false);
  const [editingPay, setEditingPay] = useState<PayMethod | null>(null);
  const [payForm, setPayForm] = useState(emptyPay);
  const [annOpen, setAnnOpen] = useState(false);
  const [annForm, setAnnForm] = useState({
    title: '',
    body: '',
    type: 'info',
    audience: 'all',
    is_published: true,
    push_to_tenants: true,
  });
  const [tenantEdit, setTenantEdit] = useState<Tenant | null>(null);
  const [tenantForm, setTenantForm] = useState({ plan: 'growth', status: 'active', days: 30 });
  const [subPayments, setSubPayments] = useState<Array<Record<string, unknown>>>([]);
  const [devices, setDevices] = useState<Array<Record<string, unknown>>>([]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [tRes, uRes, sRes, pRes, payRes, aRes, spRes, dRes] = await Promise.all([
        fetch('/api/tenants'),
        fetch('/api/users'),
        fetch('/api/platform-settings'),
        fetch('/api/subscription-plans'),
        fetch('/api/platform-payments'),
        fetch('/api/platform-announcements'),
        fetch('/api/subscription?action=payments'),
        fetch('/api/subscription?action=devices'),
      ]);
      if (!tRes.ok || !sRes.ok) throw new Error('تعذر تحميل بيانات المنصة');
      if (tRes.ok) setTenants(await tRes.json());
      if (uRes.ok) setUsers(await uRes.json());
      if (sRes.ok) setSettings(await sRes.json());
      if (pRes.ok) setPlans(await pRes.json());
      if (payRes.ok) setPayments(await payRes.json());
      if (aRes.ok) setAnnouncements(await aRes.json());
      if (spRes.ok) setSubPayments(await spRes.json());
      if (dRes.ok) setDevices(await dRes.json());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'خطأ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filteredTenants = useMemo(() => {
    if (!subscriberQ.trim()) return tenants;
    const q = subscriberQ.toLowerCase();
    return tenants.filter(
      (t) =>
        t.name_ar?.includes(subscriberQ) ||
        t.name?.toLowerCase().includes(q) ||
        t.email?.toLowerCase().includes(q) ||
        t.phone?.includes(subscriberQ) ||
        t.plan?.toLowerCase().includes(q)
    );
  }, [tenants, subscriberQ]);

  const stats = useMemo(() => {
    const active = tenants.filter((t) => t.status === 'active').length;
    const trial = tenants.filter((t) => t.status === 'trial').length;
    const suspended = tenants.filter((t) => t.status === 'suspended' || t.status === 'inactive').length;
    return { active, trial, suspended, total: tenants.length, users: users.length };
  }, [tenants, users]);

  const saveSettings = async () => {
    if (!settings) return;
    setBusy(true);
    try {
      const res = await fetch('/api/platform-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error('فشل الحفظ');
      setSettings(await res.json());
      showToast('تم حفظ إعدادات المنصة');
    } catch (err) {
      console.error(err);
      showToast('تعذر حفظ الإعدادات');
    } finally {
      setBusy(false);
    }
  };

  const uploadPlatformLogo = async (file: File) => {
    setBusy(true);
    try {
      const fileBase64 = await fileToBase64(file);
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          fileBase64,
          contentType: file.type || 'image/png',
          folder: 'platform/logo',
        }),
      });
      if (!res.ok) throw new Error('upload failed');
      const data = await res.json();
      setSettings((s) => (s ? { ...s, logo_url: data.url } : s));
      showToast('تم رفع شعار المنصة');
    } catch {
      showToast('تعذر رفع الشعار');
    } finally {
      setBusy(false);
    }
  };

  const openPlanCreate = () => {
    setEditingPlan(null);
    setPlanForm({
      ...emptyPlan,
      code: `plan_${Date.now().toString().slice(-5)}`,
      trial_days: settings?.trial_days ?? 14,
      currency: settings?.default_currency || 'YER',
      sort_order: plans.length + 1,
    });
    setPlanOpen(true);
  };

  const openPlanEdit = (p: Plan) => {
    setEditingPlan(p);
    setPlanForm({
      code: p.code,
      name: p.name,
      name_ar: p.name_ar,
      description: p.description || '',
      price_monthly: Number(p.price_monthly),
      price_yearly: Number(p.price_yearly),
      currency: p.currency || 'YER',
      trial_days: Number(p.trial_days || 0),
      max_branches: Number(p.max_branches || 1),
      max_users: Number(p.max_users || 1),
      max_products: Number(p.max_products || 1000),
      featuresText: featuresList(p.features).join('\n'),
      is_popular: !!p.is_popular,
      is_active: p.is_active !== false,
      sort_order: Number(p.sort_order || 0),
    });
    setPlanOpen(true);
  };

  const savePlan = async () => {
    if (!planForm.name_ar && !planForm.name) return;
    setBusy(true);
    const features = planForm.featuresText
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean);
    const payload = {
      code: planForm.code,
      name: planForm.name || planForm.name_ar,
      name_ar: planForm.name_ar || planForm.name,
      description: planForm.description,
      price_monthly: planForm.price_monthly,
      price_yearly: planForm.price_yearly,
      currency: planForm.currency,
      trial_days: planForm.trial_days,
      max_branches: planForm.max_branches,
      max_users: planForm.max_users,
      max_products: planForm.max_products,
      features,
      is_popular: planForm.is_popular,
      is_active: planForm.is_active,
      sort_order: planForm.sort_order,
    };
    try {
      const res = await fetch('/api/subscription-plans', {
        method: editingPlan ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingPlan ? { id: editingPlan.id, ...payload } : payload),
      });
      if (!res.ok) throw new Error('fail');
      setPlanOpen(false);
      showToast(editingPlan ? 'تم تحديث الباقة' : 'تم إنشاء الباقة');
      load();
    } catch {
      showToast('تعذر حفظ الباقة');
    } finally {
      setBusy(false);
    }
  };

  const deletePlan = async (id: number) => {
    if (!confirm('حذف هذه الباقة؟')) return;
    await fetch('/api/subscription-plans', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    showToast('تم حذف الباقة');
    load();
  };

  const openPayCreate = () => {
    setEditingPay(null);
    setPayForm({ ...emptyPay, sort_order: payments.length + 1 });
    setPayOpen(true);
  };

  const openPayEdit = (p: PayMethod) => {
    setEditingPay(p);
    setPayForm({
      name: p.name,
      name_ar: p.name_ar,
      type: p.type || 'bank',
      provider: p.provider || '',
      account_name: p.account_name || '',
      account_number: p.account_number || '',
      iban: p.iban || '',
      instructions: p.instructions || '',
      is_active: p.is_active !== false,
      sort_order: Number(p.sort_order || 0),
    });
    setPayOpen(true);
  };

  const savePay = async () => {
    if (!payForm.name_ar && !payForm.name) return;
    setBusy(true);
    const payload = {
      ...payForm,
      name: payForm.name || payForm.name_ar,
      name_ar: payForm.name_ar || payForm.name,
    };
    try {
      const res = await fetch('/api/platform-payments', {
        method: editingPay ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingPay ? { id: editingPay.id, ...payload } : payload),
      });
      if (!res.ok) throw new Error('fail');
      setPayOpen(false);
      showToast('تم حفظ طريقة الدفع');
      load();
    } catch {
      showToast('تعذر الحفظ');
    } finally {
      setBusy(false);
    }
  };

  const deletePay = async (id: number) => {
    if (!confirm('حذف طريقة الدفع؟')) return;
    await fetch('/api/platform-payments', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    load();
  };

  const saveAnnouncement = async () => {
    if (!annForm.title || !annForm.body) return;
    setBusy(true);
    try {
      const res = await fetch('/api/platform-announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(annForm),
      });
      if (!res.ok) throw new Error('fail');
      setAnnOpen(false);
      setAnnForm({
        title: '',
        body: '',
        type: 'info',
        audience: 'all',
        is_published: true,
        push_to_tenants: true,
      });
      showToast(annForm.push_to_tenants ? 'تم النشر وإرسال الإشعار للمستأجرين' : 'تم حفظ الإعلان');
      load();
    } catch {
      showToast('تعذر نشر الإعلان');
    } finally {
      setBusy(false);
    }
  };

  const deleteAnnouncement = async (id: number) => {
    if (!confirm('حذف الإعلان؟')) return;
    await fetch('/api/platform-announcements', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    load();
  };

  const saveTenant = async () => {
    if (!tenantEdit) return;
    setBusy(true);
    try {
      // Manual activation path when marking active
      if (tenantForm.status === 'active') {
        await fetch('/api/subscription', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'admin-activate',
            tenant_id: tenantEdit.id,
            plan_code: tenantForm.plan,
            days: tenantForm.days || 30,
            notes: 'تفعيل/تجديد من لوحة الإدارة',
          }),
        });
      }
      const res = await fetch('/api/tenants', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: tenantEdit.id, plan: tenantForm.plan, status: tenantForm.status }),
      });
      if (!res.ok) throw new Error('fail');
      setTenantEdit(null);
      showToast('تم تحديث المشترك');
      load();
    } catch {
      showToast('تعذر التحديث');
    } finally {
      setBusy(false);
    }
  };

  const reviewSubPayment = async (paymentId: number, decision: 'approved' | 'rejected') => {
    const note =
      decision === 'rejected'
        ? prompt('سبب الرفض (اختياري):') || ''
        : prompt('ملاحظة للإدارة (اختياري):') || '';
    setBusy(true);
    try {
      const res = await fetch('/api/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'review-payment',
          payment_id: paymentId,
          decision,
          admin_notes: note,
          reviewed_by: profile?.email || profile?.full_name || 'admin',
        }),
      });
      if (!res.ok) throw new Error('fail');
      showToast(decision === 'approved' ? 'تم اعتماد التحويل وتفعيل الاشتراك' : 'تم رفض الطلب');
      load();
    } catch {
      showToast('تعذر مراجعة الطلب');
    } finally {
      setBusy(false);
    }
  };

  const releaseDevice = async (id: number, allowNewTrial = false) => {
    if (!confirm(allowNewTrial ? 'تحرير الجهاز والسماح بتجربة جديدة؟' : 'تحرير ارتباط الجهاز؟')) return;
    await fetch('/api/subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'release-device', id, allow_new_trial: allowNewTrial }),
    });
    showToast('تم تحديث الجهاز');
    load();
  };

  const pendingSubPayments = subPayments.filter((p) => p.status === 'pending');

  if (loading) return <PageSkeleton />;
  if (error) return <ErrorState description={error} onRetry={load} />;

  const isSuper = profile?.role === 'superadmin';

  if (!isSuper) {
    return (
      <ErrorState
        title="غير مصرح"
        description="إدارة النظام متاحة فقط عبر بوابة المسؤول الخارجية ولحسابات superadmin."
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="إدارة نظام رفد"
        description="بوابة المنصة الخارجية · المشتركين · الباقات · التجربة · الدفع · التواصل · الإشعارات · الهوية"
        actions={
          <div className="flex items-center gap-2">
            {settings?.logo_url ? (
              <img src={settings.logo_url} alt="RAFD" className="h-10 w-10 rounded-xl object-contain bg-muted p-1" />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <Crown className="h-5 w-5" />
              </div>
            )}
            <Badge tone={settings?.maintenance_mode ? 'warning' : 'success'}>
              {settings?.maintenance_mode ? 'وضع الصيانة' : 'المنصة تعمل'}
            </Badge>
          </div>
        }
      />

      {toast && (
        <div className="mb-4">
          <SuccessToast title={toast} />
        </div>
      )}

      <div className="mb-5">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'overview', label: 'نظرة عامة' },
            { id: 'subscribers', label: 'المشتركون', count: tenants.length },
            { id: 'approvals', label: 'اعتماد التحويلات', count: pendingSubPayments.length },
            { id: 'devices', label: 'الأجهزة', count: devices.length },
            { id: 'plans', label: 'الباقات', count: plans.length },
            { id: 'trial', label: 'التجربة' },
            { id: 'payments', label: 'طرق الدفع', count: payments.length },
            { id: 'contact', label: 'التواصل' },
            { id: 'notifications', label: 'الإشعارات', count: announcements.length },
            { id: 'branding', label: 'الشعار والهوية' },
          ]}
        />
      </div>

      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard title="المشتركون" value={String(stats.total)} icon={Building2} tone="primary" />
            <StatCard title="نشط" value={String(stats.active)} icon={Activity} tone="success" />
            <StatCard title="تجريبي" value={String(stats.trial)} icon={Shield} tone="accent" />
            <StatCard title="موقوف" value={String(stats.suspended)} icon={Package} tone="danger" />
            <StatCard title="المستخدمون" value={String(stats.users)} icon={Users} tone="info" />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader title="أحدث المشتركين" />
              <CardBody className="space-y-2 pt-2">
                {tenants.slice(0, 6).map((t) => (
                  <div key={t.id} className="flex items-center justify-between rounded-xl border border-app px-3 py-2.5">
                    <div className="min-w-0">
                      <div className="font-medium text-app truncate">{t.name_ar || t.name}</div>
                      <div className="text-xs text-muted">{t.email || t.phone || '—'}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone="primary">{t.plan}</Badge>
                      <Badge tone={t.status === 'active' ? 'success' : 'warning'}>{t.status}</Badge>
                    </div>
                  </div>
                ))}
                {!tenants.length && <div className="py-8 text-center text-sm text-muted">لا مشتركون بعد</div>}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="ملخص المنصة" />
              <CardBody className="space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-muted">الفترة التجريبية</span><strong>{settings?.trial_days ?? 14} يوم</strong></div>
                <div className="flex justify-between"><span className="text-muted">العملة الافتراضية</span><strong>{settings?.default_currency || 'YER'}</strong></div>
                <div className="flex justify-between"><span className="text-muted">الباقات النشطة</span><strong>{plans.filter((p) => p.is_active).length}</strong></div>
                <div className="flex justify-between"><span className="text-muted">طرق الدفع</span><strong>{payments.filter((p) => p.is_active).length}</strong></div>
                <div className="flex justify-between"><span className="text-muted">التسجيل المفتوح</span><strong>{settings?.allow_registration ? 'نعم' : 'لا'}</strong></div>
                <Button className="w-full mt-2" variant="outline" onClick={() => setTab('branding')}>
                  <Settings2 className="h-4 w-4" /> إعدادات المنصة
                </Button>
              </CardBody>
            </Card>
          </div>
        </div>
      )}

      {tab === 'subscribers' && (
        <div>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              value={subscriberQ}
              onChange={(e) => setSubscriberQ(e.target.value)}
              placeholder="بحث عن مشترك بالاسم / البريد / الهاتف / الباقة..."
              className="h-11 w-full max-w-md rounded-xl border border-app bg-surface px-3 text-sm shadow-soft focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
            />
            <Badge tone="primary">{filteredTenants.length} نتيجة</Badge>
          </div>
          <Table>
            <THead>
              <TH>المتجر</TH>
              <TH>صاحب المتجر</TH>
              <TH>الباقة</TH>
              <TH>الحالة</TH>
              <TH>البداية</TH>
              <TH>الانتهاء</TH>
              <TH>الفوترة</TH>
              <TH></TH>
            </THead>
            <TBody>
              {filteredTenants.map((t) => (
                <tr key={t.id}>
                  <TD>
                    <div className="flex items-center gap-2">
                      {t.logo_url && <img src={t.logo_url} alt="" className="h-8 w-8 rounded-lg object-contain bg-muted" />}
                      <div>
                        <div className="font-medium">{t.name_ar || t.name}</div>
                        <div className="text-xs text-muted">#{t.id}</div>
                      </div>
                    </div>
                  </TD>
                  <TD>
                    <div className="text-sm">{t.owner?.full_name || t.email || '—'}</div>
                    <div className="text-xs text-muted">{t.owner?.email || t.email || '—'}</div>
                  </TD>
                  <TD><Badge tone="primary">{t.plan_code || t.plan || '—'}</Badge></TD>
                  <TD>
                    <Badge tone={t.status === 'active' ? 'success' : t.status === 'trial' ? 'accent' : 'warning'}>
                      {t.status || '—'}
                    </Badge>
                  </TD>
                  <TD>{formatDate(t.subscription_starts_at || t.trial_starts_at || t.created_at)}</TD>
                  <TD>{formatDate(t.subscription_ends_at || t.trial_ends_at || '')}</TD>
                  <TD>{t.billing_cycle || '—'}</TD>
                  <TD>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setTenantEdit(t);
                        setTenantForm({ plan: t.plan_code || t.plan || 'growth', status: t.status || 'active', days: 30 });
                      }}
                    >
                      إدارة
                    </Button>
                  </TD>
                </tr>
              ))}
            </TBody>
          </Table>
        </div>
      )}

      {tab === 'approvals' && (
        <div className="space-y-3">
          <div className="rounded-2xl border border-app bg-surface p-4 text-sm text-secondary">
            راجع إثباتات تحويل الاشتراك. عند الاعتماد يتم تفعيل المتجر وفتح صلاحية الاستخدام تلقائياً.
          </div>
          {!subPayments.length && (
            <div className="rounded-2xl border border-dashed border-app py-12 text-center text-muted">
              لا توجد طلبات اشتراك بعد
            </div>
          )}
          {subPayments.map((p) => {
            const tenantName =
              tenants.find((t) => t.id === Number(p.tenant_id))?.name_ar ||
              tenants.find((t) => t.id === Number(p.tenant_id))?.name ||
              `#${p.tenant_id}`;
            return (
              <Card key={String(p.id)}>
                <CardBody className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-semibold text-app">{tenantName}</div>
                      <Badge
                        tone={
                          p.status === 'approved'
                            ? 'success'
                            : p.status === 'rejected'
                              ? 'danger'
                              : 'warning'
                        }
                      >
                        {String(p.status)}
                      </Badge>
                      <Badge tone="primary">{String(p.plan_code)}</Badge>
                      <Badge tone="info">{String(p.billing_cycle || 'monthly')}</Badge>
                    </div>
                    <div className="text-sm text-muted">
                      {formatMoney(Number(p.amount || 0), String(p.currency || 'YER'))} ·{' '}
                      {String(p.payment_method_name || '—')} · {String(p.sender_name || '—')}
                    </div>
                    <div className="text-xs text-muted">
                      مرجع: {String(p.reference || '—')} · {formatDate(String(p.created_at || ''))}
                    </div>
                    {!!p.notes && <div className="text-xs text-secondary">ملاحظة: {String(p.notes)}</div>}
                    {!!p.proof_url && (
                      <a
                        href={String(p.proof_url)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block text-sm text-primary underline"
                      >
                        عرض إثبات التحويل
                      </a>
                    )}
                  </div>
                  {p.status === 'pending' && (
                    <div className="flex gap-2">
                      <Button
                        loading={busy}
                        onClick={() => reviewSubPayment(Number(p.id), 'approved')}
                      >
                        اعتماد وتفعيل
                      </Button>
                      <Button
                        variant="danger"
                        loading={busy}
                        onClick={() => reviewSubPayment(Number(p.id), 'rejected')}
                      >
                        رفض
                      </Button>
                    </div>
                  )}
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      {tab === 'devices' && (
        <div className="space-y-3">
          <div className="rounded-2xl border border-app bg-surface p-4 text-sm text-secondary">
            كل جهاز يحصل على فترة تجريبية واحدة. تحرير الجهاز يسمح للإدارة بمعالجة الحالات الاستثنائية.
          </div>
          <Table>
            <THead>
              <TH>الجهاز</TH>
              <TH>المتجر</TH>
              <TH>المالك</TH>
              <TH>تجربة</TH>
              <TH>الحالة</TH>
              <TH></TH>
            </THead>
            <TBody>
              {devices.map((d) => (
                <tr key={String(d.id)}>
                  <TD>
                    <div className="max-w-[180px] truncate font-mono text-[11px]" dir="ltr" title={String(d.device_id)}>
                      {String(d.device_id)}
                    </div>
                  </TD>
                  <TD>{String(d.store_name || d.tenant_id || '—')}</TD>
                  <TD>
                    <div className="text-sm">{String(d.owner_name || '—')}</div>
                    <div className="text-xs text-muted">{String(d.owner_email || '')}</div>
                  </TD>
                  <TD>
                    <Badge tone={d.trial_used ? 'warning' : 'success'}>
                      {d.trial_used ? 'مستخدمة' : 'متاحة'}
                    </Badge>
                  </TD>
                  <TD>
                    <Badge tone={d.status === 'active' ? 'primary' : 'default'}>{String(d.status)}</Badge>
                  </TD>
                  <TD>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => releaseDevice(Number(d.id), false)}>
                        تحرير
                      </Button>
                      <Button size="sm" variant="soft" onClick={() => releaseDevice(Number(d.id), true)}>
                        سماح بتجربة
                      </Button>
                    </div>
                  </TD>
                </tr>
              ))}
            </TBody>
          </Table>
        </div>
      )}

      {tab === 'plans' && (
        <div>
          <div className="mb-4 flex justify-end">
            <Button onClick={openPlanCreate}><Plus className="h-4 w-4" /> باقة جديدة</Button>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {plans.map((p) => (
              <Card key={p.id} className={cn(p.is_popular && 'border-primary shadow-lift')}>
                <CardBody className="flex h-full flex-col">
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs text-muted">{p.code}</div>
                      <div className="text-xl font-bold text-app">{p.name_ar || p.name}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {p.is_popular && <Badge tone="accent">الأشهر</Badge>}
                      <Badge tone={p.is_active ? 'success' : 'default'}>{p.is_active ? 'نشطة' : 'موقوفة'}</Badge>
                    </div>
                  </div>
                  <div className="mb-1 text-3xl font-bold tabular text-primary">
                    {formatMoney(p.price_monthly, p.currency || 'YER')}
                    <span className="text-sm font-medium text-muted"> / شهر</span>
                  </div>
                  <div className="mb-4 text-sm text-muted">
                    سنوي: {formatMoney(p.price_yearly, p.currency || 'YER')} · تجربة {p.trial_days} يوم
                  </div>
                  <ul className="mb-4 flex-1 space-y-1.5 text-sm text-secondary">
                    <li>• فروع: {p.max_branches}</li>
                    <li>• مستخدمون: {p.max_users}</li>
                    <li>• منتجات: {p.max_products}</li>
                    {featuresList(p.features).slice(0, 4).map((f) => (
                      <li key={f}>• {f}</li>
                    ))}
                  </ul>
                  <div className="flex gap-2">
                    <Button className="flex-1" variant="outline" onClick={() => openPlanEdit(p)}>
                      <Pencil className="h-4 w-4" /> تعديل
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => deletePlan(p.id)}>
                      <Trash2 className="h-4 w-4 text-danger" />
                    </Button>
                  </div>
                </CardBody>
              </Card>
            ))}
            {!plans.length && (
              <Card className="lg:col-span-3">
                <CardBody className="py-12 text-center text-muted">لا توجد باقات — أنشئ باقتك الأولى</CardBody>
              </Card>
            )}
          </div>
        </div>
      )}

      {tab === 'trial' && settings && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="إعدادات الفترة التجريبية" description="تُطبَّق على الاشتراكات الجديدة والباقات" />
            <CardBody className="space-y-4">
              <Input
                label="مدة التجربة (بالأيام)"
                type="number"
                min={0}
                value={settings.trial_days}
                onChange={(e) => setSettings({ ...settings, trial_days: Number(e.target.value) || 0 })}
              />
              <div className="rounded-2xl bg-muted p-4 text-sm text-secondary">
                بعد انتهاء التجربة يتحول المتجر إلى حالة <strong>trial_ended</strong> أو يطلب ترقية حسب الباقة.
                يمكنك أيضاً ضبط أيام التجربة لكل باقة على حدة من تبويب الباقات.
              </div>
              <div className="flex flex-wrap gap-2">
                {[7, 14, 30, 60].map((d) => (
                  <Button key={d} variant={settings.trial_days === d ? 'primary' : 'outline'} size="sm" onClick={() => setSettings({ ...settings, trial_days: d })}>
                    {d} يوم
                  </Button>
                ))}
              </div>
              <Button loading={busy} onClick={saveSettings}>حفظ مدة التجربة</Button>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="سياسات التسجيل" />
            <CardBody className="space-y-4">
              <label className="flex items-center justify-between rounded-xl border border-app px-4 py-3">
                <span className="text-sm font-medium">السماح بالتسجيل الذاتي</span>
                <input
                  type="checkbox"
                  checked={!!settings.allow_registration}
                  onChange={(e) => setSettings({ ...settings, allow_registration: e.target.checked })}
                  className="h-5 w-5"
                />
              </label>
              <label className="flex items-center justify-between rounded-xl border border-app px-4 py-3">
                <span className="text-sm font-medium">وضع الصيانة</span>
                <input
                  type="checkbox"
                  checked={!!settings.maintenance_mode}
                  onChange={(e) => setSettings({ ...settings, maintenance_mode: e.target.checked })}
                  className="h-5 w-5"
                />
              </label>
              <Select
                label="عملة المنصة الافتراضية"
                value={settings.default_currency}
                onChange={(e) => setSettings({ ...settings, default_currency: e.target.value })}
                options={[
                  { value: 'YER', label: 'ريال يمني (YER)' },
                  { value: 'SAR', label: 'ريال سعودي (SAR)' },
                  { value: 'USD', label: 'دولار (USD)' },
                ]}
              />
              <Button loading={busy} onClick={saveSettings}>حفظ السياسات</Button>
            </CardBody>
          </Card>
        </div>
      )}

      {tab === 'payments' && (
        <div>
          <div className="mb-4 flex justify-end">
            <Button onClick={openPayCreate}><Plus className="h-4 w-4" /> طريقة دفع</Button>
          </div>
          <div className="grid gap-3">
            {payments.map((p) => (
              <Card key={p.id}>
                <CardBody className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft text-primary">
                      <CreditCard className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-semibold text-app">{p.name_ar || p.name}</div>
                      <div className="text-sm text-muted">{p.provider || p.type} · {p.account_name || '—'}</div>
                      <div className="mt-1 font-mono text-xs text-muted" dir="ltr">{p.account_number || p.iban || '—'}</div>
                      {p.instructions && <div className="mt-2 text-xs text-secondary max-w-xl">{p.instructions}</div>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={p.is_active ? 'success' : 'default'}>{p.is_active ? 'مفعّلة' : 'موقوفة'}</Badge>
                    <Button size="sm" variant="outline" onClick={() => openPayEdit(p)}>تعديل</Button>
                    <Button size="icon" variant="ghost" onClick={() => deletePay(p.id)}><Trash2 className="h-4 w-4 text-danger" /></Button>
                  </div>
                </CardBody>
              </Card>
            ))}
            {!payments.length && (
              <div className="rounded-2xl border border-dashed border-app py-12 text-center text-muted">
                أضف حسابات بنكية أو بوابات دفع لاستقبال اشتراكات المنصة
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'contact' && settings && (
        <Card>
          <CardHeader title="معلومات التواصل" description="تظهر للمشتركين في صفحة الاشتراك والدعم" />
          <CardBody className="grid gap-3 sm:grid-cols-2">
            <Input label="البريد" value={settings.support_email} onChange={(e) => setSettings({ ...settings, support_email: e.target.value })} />
            <Input label="الهاتف" value={settings.support_phone} onChange={(e) => setSettings({ ...settings, support_phone: e.target.value })} />
            <Input label="واتساب" value={settings.support_whatsapp} onChange={(e) => setSettings({ ...settings, support_whatsapp: e.target.value })} />
            <Input label="الموقع" value={settings.website} onChange={(e) => setSettings({ ...settings, website: e.target.value })} />
            <div className="sm:col-span-2">
              <Input label="العنوان" value={settings.address} onChange={(e) => setSettings({ ...settings, address: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Input label="تذييل المنصة" value={settings.invoice_footer} onChange={(e) => setSettings({ ...settings, invoice_footer: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Button loading={busy} onClick={saveSettings}>حفظ معلومات التواصل</Button>
            </div>
          </CardBody>
        </Card>
      )}

      {tab === 'notifications' && (
        <div>
          <div className="mb-4 flex justify-end">
            <Button onClick={() => setAnnOpen(true)}><Megaphone className="h-4 w-4" /> إعلان جديد</Button>
          </div>
          <div className="space-y-2">
            {announcements.map((a) => (
              <div key={a.id} className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-app bg-surface px-4 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-semibold text-app">{a.title}</div>
                    <Badge tone={a.type === 'warning' ? 'warning' : a.type === 'success' ? 'success' : 'info'}>{a.type}</Badge>
                    <Badge tone={a.is_published ? 'success' : 'default'}>{a.is_published ? 'منشور' : 'مسودة'}</Badge>
                    <Badge tone="primary">{a.audience}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-secondary">{a.body}</p>
                  <div className="mt-1 text-xs text-muted">{formatDate(a.created_at)}</div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => deleteAnnouncement(a.id)}>
                  <Trash2 className="h-4 w-4 text-danger" />
                </Button>
              </div>
            ))}
            {!announcements.length && (
              <div className="rounded-2xl border border-dashed border-app py-12 text-center text-muted">
                لا إعلانات بعد — أرسل تنبيهات التحديثات والعروض للمشتركين
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'branding' && settings && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="شعار منصة رفد" description="يظهر في لوحة الإدارة وصفحات المنصة" />
            <CardBody className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-2xl border border-app bg-muted">
                  {settings.logo_url ? (
                    <img src={settings.logo_url} alt="logo" className="h-full w-full object-contain p-2" />
                  ) : (
                    <ImagePlus className="h-8 w-8 text-muted" />
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <label className="inline-flex cursor-pointer">
                    <span className="inline-flex h-11 items-center rounded-xl bg-primary px-4 text-sm font-medium text-inverse">
                      {busy ? 'جاري الرفع...' : 'رفع شعار جديد'}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) uploadPlatformLogo(f);
                      }}
                    />
                  </label>
                  <Input
                    label="أو رابط الشعار"
                    value={settings.logo_url || ''}
                    onChange={(e) => setSettings({ ...settings, logo_url: e.target.value })}
                  />
                </div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="هوية المنصة" />
            <CardBody className="grid gap-3 sm:grid-cols-2">
              <Input label="الاسم العربي" value={settings.app_name_ar} onChange={(e) => setSettings({ ...settings, app_name_ar: e.target.value })} />
              <Input label="Name EN" value={settings.app_name} onChange={(e) => setSettings({ ...settings, app_name: e.target.value })} />
              <div>
                <label className="mb-1.5 block text-sm text-secondary">اللون الأساسي</label>
                <input type="color" value={settings.primary_color} onChange={(e) => setSettings({ ...settings, primary_color: e.target.value })} className="h-11 w-full rounded-xl border border-app bg-surface p-1" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm text-secondary">اللون الثانوي</label>
                <input type="color" value={settings.secondary_color} onChange={(e) => setSettings({ ...settings, secondary_color: e.target.value })} className="h-11 w-full rounded-xl border border-app bg-surface p-1" />
              </div>
              <div
                className="sm:col-span-2 flex items-center gap-3 rounded-2xl p-5 text-white"
                style={{ background: `linear-gradient(135deg, ${settings.primary_color}, ${settings.secondary_color})` }}
              >
                {settings.logo_url && <img src={settings.logo_url} alt="" className="h-12 w-12 rounded-xl bg-white/20 object-contain p-1" />}
                <div>
                  <div className="text-sm opacity-80">معاينة</div>
                  <div className="text-2xl font-bold">{settings.app_name_ar} | {settings.app_name}</div>
                </div>
              </div>
              <div className="sm:col-span-2">
                <Button loading={busy} onClick={saveSettings}>حفظ الهوية</Button>
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {/* Plan dialog */}
      <Dialog
        open={planOpen}
        onClose={() => setPlanOpen(false)}
        title={editingPlan ? 'تعديل الباقة' : 'باقة جديدة'}
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setPlanOpen(false)}>إلغاء</Button>
            <Button loading={busy} onClick={savePlan}>حفظ الباقة</Button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="الكود" value={planForm.code} onChange={(e) => setPlanForm({ ...planForm, code: e.target.value })} />
          <Input label="الترتيب" type="number" value={planForm.sort_order} onChange={(e) => setPlanForm({ ...planForm, sort_order: Number(e.target.value) })} />
          <Input label="الاسم بالعربي" value={planForm.name_ar} onChange={(e) => setPlanForm({ ...planForm, name_ar: e.target.value })} />
          <Input label="Name EN" value={planForm.name} onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })} />
          <Input label="السعر الشهري" type="number" value={planForm.price_monthly} onChange={(e) => setPlanForm({ ...planForm, price_monthly: Number(e.target.value) })} />
          <Input label="السعر السنوي" type="number" value={planForm.price_yearly} onChange={(e) => setPlanForm({ ...planForm, price_yearly: Number(e.target.value) })} />
          <Select
            label="العملة"
            value={planForm.currency}
            onChange={(e) => setPlanForm({ ...planForm, currency: e.target.value })}
            options={[
              { value: 'YER', label: 'YER' },
              { value: 'SAR', label: 'SAR' },
              { value: 'USD', label: 'USD' },
            ]}
          />
          <Input label="أيام التجربة" type="number" value={planForm.trial_days} onChange={(e) => setPlanForm({ ...planForm, trial_days: Number(e.target.value) })} />
          <Input label="أقصى فروع" type="number" value={planForm.max_branches} onChange={(e) => setPlanForm({ ...planForm, max_branches: Number(e.target.value) })} />
          <Input label="أقصى مستخدمين" type="number" value={planForm.max_users} onChange={(e) => setPlanForm({ ...planForm, max_users: Number(e.target.value) })} />
          <Input label="أقصى منتجات" type="number" value={planForm.max_products} onChange={(e) => setPlanForm({ ...planForm, max_products: Number(e.target.value) })} />
          <div className="sm:col-span-2">
            <Input label="الوصف" value={planForm.description} onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-secondary">الميزات (سطر لكل ميزة)</label>
            <textarea
              className="min-h-28 w-full rounded-xl border border-app bg-surface px-3 py-2 text-sm shadow-soft focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              value={planForm.featuresText}
              onChange={(e) => setPlanForm({ ...planForm, featuresText: e.target.value })}
              placeholder={'نقطة بيع\nمخزون\nتقارير'}
            />
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={planForm.is_popular} onChange={(e) => setPlanForm({ ...planForm, is_popular: e.target.checked })} /> باقة مميزة</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={planForm.is_active} onChange={(e) => setPlanForm({ ...planForm, is_active: e.target.checked })} /> نشطة</label>
        </div>
      </Dialog>

      {/* Payment method dialog */}
      <Dialog
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title={editingPay ? 'تعديل طريقة دفع' : 'طريقة دفع جديدة'}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setPayOpen(false)}>إلغاء</Button>
            <Button loading={busy} onClick={savePay}>حفظ</Button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="الاسم بالعربي" value={payForm.name_ar} onChange={(e) => setPayForm({ ...payForm, name_ar: e.target.value })} />
          <Input label="Name EN" value={payForm.name} onChange={(e) => setPayForm({ ...payForm, name: e.target.value })} />
          <Select
            label="النوع"
            value={payForm.type}
            onChange={(e) => setPayForm({ ...payForm, type: e.target.value })}
            options={[
              { value: 'bank', label: 'تحويل بنكي' },
              { value: 'wallet', label: 'محفظة إلكترونية' },
              { value: 'card', label: 'بطاقة' },
              { value: 'cash', label: 'نقدي' },
            ]}
          />
          <Input label="المزوّد / البنك" value={payForm.provider} onChange={(e) => setPayForm({ ...payForm, provider: e.target.value })} />
          <Input label="اسم الحساب" value={payForm.account_name} onChange={(e) => setPayForm({ ...payForm, account_name: e.target.value })} />
          <Input label="رقم الحساب" value={payForm.account_number} onChange={(e) => setPayForm({ ...payForm, account_number: e.target.value })} />
          <Input label="IBAN" value={payForm.iban} onChange={(e) => setPayForm({ ...payForm, iban: e.target.value })} />
          <Input label="الترتيب" type="number" value={payForm.sort_order} onChange={(e) => setPayForm({ ...payForm, sort_order: Number(e.target.value) })} />
          <div className="sm:col-span-2">
            <Input label="تعليمات للمشترك" value={payForm.instructions} onChange={(e) => setPayForm({ ...payForm, instructions: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={payForm.is_active} onChange={(e) => setPayForm({ ...payForm, is_active: e.target.checked })} /> مفعّلة</label>
        </div>
      </Dialog>

      {/* Announcement dialog */}
      <Dialog
        open={annOpen}
        onClose={() => setAnnOpen(false)}
        title="إعلان / إشعار للمنصة"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAnnOpen(false)}>إلغاء</Button>
            <Button loading={busy} onClick={saveAnnouncement}><Bell className="h-4 w-4" /> نشر</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Input label="العنوان" value={annForm.title} onChange={(e) => setAnnForm({ ...annForm, title: e.target.value })} />
          <div>
            <label className="mb-1.5 block text-sm font-medium text-secondary">المحتوى</label>
            <textarea
              className="min-h-28 w-full rounded-xl border border-app bg-surface px-3 py-2 text-sm shadow-soft focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              value={annForm.body}
              onChange={(e) => setAnnForm({ ...annForm, body: e.target.value })}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label="النوع"
              value={annForm.type}
              onChange={(e) => setAnnForm({ ...annForm, type: e.target.value })}
              options={[
                { value: 'info', label: 'معلومة' },
                { value: 'success', label: 'نجاح / عرض' },
                { value: 'warning', label: 'تنبيه' },
                { value: 'danger', label: 'هام' },
              ]}
            />
            <Select
              label="الجمهور"
              value={annForm.audience}
              onChange={(e) => setAnnForm({ ...annForm, audience: e.target.value })}
              options={[
                { value: 'all', label: 'الكل' },
                { value: 'owners', label: 'الملاك' },
                { value: 'trial', label: 'التجريبيون' },
                { value: 'paid', label: 'المشتركون المدفوعون' },
              ]}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={annForm.push_to_tenants} onChange={(e) => setAnnForm({ ...annForm, push_to_tenants: e.target.checked })} />
            إرسال إلى إشعارات كل المتاجر
          </label>
        </div>
      </Dialog>

      {/* Tenant manage */}
      <Dialog
        open={!!tenantEdit}
        onClose={() => setTenantEdit(null)}
        title={`إدارة المشترك — ${tenantEdit?.name_ar || ''}`}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setTenantEdit(null)}>إلغاء</Button>
            <Button loading={busy} onClick={saveTenant}>حفظ</Button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label="الباقة"
            value={tenantForm.plan}
            onChange={(e) => setTenantForm({ ...tenantForm, plan: e.target.value })}
            options={
              plans.length
                ? plans.map((p) => ({ value: p.code, label: p.name_ar || p.name }))
                : [
                    { value: 'starter', label: 'Starter' },
                    { value: 'growth', label: 'Growth' },
                    { value: 'enterprise', label: 'Enterprise' },
                  ]
            }
          />
          <Select
            label="الحالة"
            value={tenantForm.status}
            onChange={(e) => setTenantForm({ ...tenantForm, status: e.target.value })}
            options={[
              { value: 'active', label: 'نشط (تفعيل)' },
              { value: 'trial', label: 'تجريبي' },
              { value: 'expired', label: 'منتهي' },
              { value: 'suspended', label: 'موقوف' },
              { value: 'inactive', label: 'غير نشط' },
            ]}
          />
          <Input
            label="أيام التفعيل عند اختيار نشط"
            type="number"
            min={1}
            value={tenantForm.days}
            onChange={(e) => setTenantForm({ ...tenantForm, days: Number(e.target.value) || 30 })}
          />
        </div>
      </Dialog>
    </div>
  );
}
