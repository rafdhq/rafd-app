import { useEffect, useMemo, useState } from 'react';
import { ImagePlus, Layers, Printer, Store } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import { useTenant } from '../contexts/TenantContext';
import { useTheme } from '../contexts/ThemeContext';
import { SuccessToast } from '../components/ui/States';
import {
  ALL_CATEGORIES,
  BUSINESS_TYPES,
  defaultCategoriesForBusiness,
  getBusinessType,
  resolveTenantCategories,
} from '../lib/catalog';
import { loadPosSettings, savePosSettings, type PosHardwareSettings } from '../lib/posSettings';
import { cn } from '../lib/utils';

import { compressAndEncode } from '../lib/imageCompress';

export default function Settings() {
  const { tenant, refreshTenant } = useTenant();
  const { theme, setTheme } = useTheme();
  const [form, setForm] = useState({
    name: '',
    name_ar: '',
    phone: '',
    email: '',
    address: '',
    tax_number: '',
    currency: 'YER',
    primary_color: '#0d9488',
    secondary_color: '#d97706',
    invoice_footer: '',
    logo_url: '',
    business_type: 'grocery',
  });
  const [enabledCategories, setEnabledCategories] = useState<string[]>([]);
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [customInput, setCustomInput] = useState('');
  const [advancedCatalog, setAdvancedCatalog] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [posHw, setPosHw] = useState<PosHardwareSettings>(() => loadPosSettings());

  useEffect(() => {
    if (!tenant) return;
    setForm({
      name: tenant.name || '',
      name_ar: tenant.name_ar || '',
      phone: tenant.phone || '',
      email: tenant.email || '',
      address: tenant.address || '',
      tax_number: tenant.tax_number || '',
      currency: tenant.currency || 'YER',
      primary_color: tenant.primary_color || '#0d9488',
      secondary_color: tenant.secondary_color || '#d97706',
      invoice_footer: tenant.invoice_footer || '',
      logo_url: tenant.logo_url || '',
      business_type: tenant.business_type || 'grocery',
    });
    const resolved = resolveTenantCategories(tenant);
    setEnabledCategories(
      tenant.enabled_categories?.length
        ? tenant.enabled_categories
        : defaultCategoriesForBusiness(tenant.business_type || 'grocery')
    );
    setCustomCategories(tenant.custom_categories || []);
    // if more than defaults, show advanced
    if ((tenant.custom_categories || []).length || resolved.length > 20) {
      setAdvancedCatalog(true);
    }
  }, [tenant]);

  const businessMeta = useMemo(() => getBusinessType(form.business_type), [form.business_type]);

  const applyBusinessType = (id: string) => {
    setForm((f) => ({ ...f, business_type: id }));
    setEnabledCategories(defaultCategoriesForBusiness(id));
  };

  const toggleCategory = (id: string) => {
    setEnabledCategories((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const addCustom = () => {
    const name = customInput.trim();
    if (!name) return;
    if (!customCategories.includes(name)) setCustomCategories((c) => [...c, name]);
    if (!enabledCategories.includes(name)) setEnabledCategories((c) => [...c, name]);
    setCustomInput('');
  };

  const uploadLogo = async (file: File) => {
    setUploading(true);
    try {
      const compressed = await compressAndEncode(file, { maxEdge: 1024, quality: 0.85 });
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: compressed.fileName,
          fileBase64: compressed.fileBase64,
          contentType: compressed.contentType,
          folder: `tenants/${tenant?.id || 'store'}/logo`,
        }),
      });
      if (!res.ok) throw new Error('upload failed');
      const data = await res.json();
      setForm((f) => ({ ...f, logo_url: data.url }));
    } catch (err) {
      console.error(err);
      alert('تعذر رفع الشعار');
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!tenant?.id) return;
    setBusy(true);
    await fetch('/api/tenants', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: tenant.id,
        ...form,
        business_type: form.business_type,
        enabled_categories: enabledCategories,
        custom_categories: customCategories,
      }),
    });
    await refreshTenant();
    setBusy(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const visibleMaster = advancedCatalog
    ? ALL_CATEGORIES
    : ALL_CATEGORIES.filter((c) => businessMeta.defaultCategories.includes(c.id) || enabledCategories.includes(c.id));

  return (
    <div>
      <PageHeader
        title="الإعدادات"
        description="هوية المتجر · نوع النشاط · فئات المنتجات · الشعار والعملة"
        actions={
          <Button loading={busy} onClick={save}>
            حفظ التغييرات
          </Button>
        }
      />

      {saved && (
        <div className="mb-4">
          <SuccessToast title="تم الحفظ" description="تم تحديث إعدادات المتجر والفئات" />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="بيانات المتجر" />
          <CardBody className="grid gap-3 sm:grid-cols-2">
            <Input
              label="الاسم العربي"
              value={form.name_ar}
              onChange={(e) => setForm({ ...form, name_ar: e.target.value })}
            />
            <Input label="Name EN" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input label="الجوال" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <Input label="البريد" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <div className="sm:col-span-2">
              <Input
                label="العنوان"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
            <Input
              label="الرقم الضريبي"
              value={form.tax_number}
              onChange={(e) => setForm({ ...form, tax_number: e.target.value })}
            />
            <Select
              label="العملة"
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
              options={[
                { value: 'YER', label: 'ريال يمني (YER)' },
                { value: 'SAR', label: 'ريال سعودي (SAR)' },
                { value: 'USD', label: 'دولار (USD)' },
              ]}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="شعار المتجر" description="يظهر في الواجهة والفواتير" />
          <CardBody className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl border border-app bg-muted">
                {form.logo_url ? (
                  <img src={form.logo_url} alt="logo" className="h-full w-full object-contain" />
                ) : (
                  <ImagePlus className="h-8 w-8 text-muted" />
                )}
              </div>
              <div className="flex-1 space-y-2">
                <label className="inline-flex cursor-pointer">
                  <span className="inline-flex h-11 items-center rounded-xl bg-primary px-4 text-sm font-medium text-inverse">
                    {uploading ? 'جاري الرفع...' : 'رفع شعار'}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadLogo(f);
                    }}
                  />
                </label>
                <Input
                  label="أو الصق رابط الشعار"
                  value={form.logo_url}
                  onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
                  placeholder="https://..."
                />
              </div>
            </div>
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <Store className="h-4 w-4 text-primary" />
                نوع نشاط المتجر
              </span>
            }
            description="يحدد الفئات الافتراضية عند إضافة المنتجات — يمكن توسيعها لاحقاً"
          />
          <CardBody>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {BUSINESS_TYPES.map((b) => {
                const active = form.business_type === b.id;
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => applyBusinessType(b.id)}
                    className={cn(
                      'rounded-2xl border p-4 text-start transition',
                      active
                        ? 'border-primary bg-primary-soft shadow-soft'
                        : 'border-app bg-surface hover:border-strong'
                    )}
                  >
                    <div className="font-semibold text-app">{b.label}</div>
                    <div className="mt-0.5 text-xs text-muted">{b.labelEn}</div>
                    <p className="mt-2 text-sm text-secondary">{b.description}</p>
                    <div className="mt-2 text-[11px] text-muted">{b.defaultCategories.length} فئة افتراضية</div>
                  </button>
                );
              })}
            </div>
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" />
                فئات المنتجات المفعّلة
              </span>
            }
            description={`مفعّل الآن: ${enabledCategories.length} فئة · عند إضافة منتج تظهر هذه الفئات افتراضياً`}
            action={
              <label className="flex items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={advancedCatalog}
                  onChange={(e) => setAdvancedCatalog(e.target.checked)}
                />
                خيارات متقدمة (كل الفئات)
              </label>
            }
          />
          <CardBody className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {visibleMaster.map((c) => {
                const on = enabledCategories.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleCategory(c.id)}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-sm transition',
                      on
                        ? 'border-primary bg-primary text-inverse'
                        : 'border-app bg-muted text-secondary hover:border-primary'
                    )}
                  >
                    {c.label}
                    {c.byWeight ? ' · وزن' : ''}
                  </button>
                );
              })}
            </div>

            {customCategories.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {customCategories.map((c) => (
                  <Badge key={c} tone="accent">
                    مخصص: {c}
                  </Badge>
                ))}
              </div>
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <Input
                label="إضافة فئة مخصصة"
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                placeholder="مثال: لوازم رحلات، مستلزمات مناسبات..."
                containerClassName="flex-1"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addCustom();
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={addCustom}>
                إضافة
              </Button>
            </div>

            <div className="rounded-2xl bg-muted/70 px-4 py-3 text-sm text-secondary">
              <strong className="text-app">نصيحة:</strong> سوبرماركت كبير أو متجر متخصص (بهارات، خردوات، أجهزة،
              مطعم، مكتبة...) — اختر نوع النشاط ثم فعّل أي فئات إضافية من الخيارات المتقدمة دون تغيير باقي
              الإعدادات.
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="الهوية البصرية" />
          <CardBody className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-sm text-secondary">اللون الأساسي</label>
                <input
                  type="color"
                  value={form.primary_color}
                  onChange={(e) => setForm({ ...form, primary_color: e.target.value })}
                  className="h-11 w-full cursor-pointer rounded-xl border border-app bg-surface p-1"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm text-secondary">اللون الثانوي</label>
                <input
                  type="color"
                  value={form.secondary_color}
                  onChange={(e) => setForm({ ...form, secondary_color: e.target.value })}
                  className="h-11 w-full cursor-pointer rounded-xl border border-app bg-surface p-1"
                />
              </div>
            </div>
            <Input
              label="تذييل الفاتورة"
              value={form.invoice_footer}
              onChange={(e) => setForm({ ...form, invoice_footer: e.target.value })}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="المظهر" description="Light / Dark" />
          <CardBody className="flex gap-2">
            <Button variant={theme === 'light' ? 'primary' : 'outline'} onClick={() => setTheme('light')}>
              فاتح
            </Button>
            <Button variant={theme === 'dark' ? 'primary' : 'outline'} onClick={() => setTheme('dark')}>
              داكن
            </Button>
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <Printer className="h-4 w-4 text-primary" />
                الطابعة الحرارية ونقطة البيع
              </span>
            }
            description="إعدادات محلية على هذا الجهاز — تطبق فوراً في شاشة POS"
          />
          <CardBody className="space-y-4">
            <label className="flex items-center justify-between gap-3 rounded-2xl border border-app bg-subtle px-4 py-3">
              <div>
                <div className="font-semibold text-app">طباعة تلقائية بعد إتمام الدفع</div>
                <div className="text-xs text-muted">
                  يُرسل إيصال حراري للطابعة الموصولة مباشرة
                </div>
              </div>
              <input
                type="checkbox"
                className="h-5 w-5 accent-[var(--primary)]"
                checked={posHw.autoPrintThermal}
                onChange={(e) => setPosHw((s) => ({ ...s, autoPrintThermal: e.target.checked }))}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <Select
                label="عرض الورق"
                value={posHw.paperWidth}
                onChange={(e) =>
                  setPosHw((s) => ({ ...s, paperWidth: e.target.value as '58' | '80' }))
                }
                options={[
                  { value: '80', label: '80 مم' },
                  { value: '58', label: '58 مم' },
                ]}
              />
              <Select
                label="عدد النسخ"
                value={String(posHw.printCopies)}
                onChange={(e) =>
                  setPosHw((s) => ({ ...s, printCopies: Number(e.target.value) || 1 }))
                }
                options={[
                  { value: '1', label: '1' },
                  { value: '2', label: '2' },
                  { value: '3', label: '3' },
                ]}
              />
              <Select
                label="الدفع الافتراضي"
                value={posHw.defaultPaymentMethod}
                onChange={(e) =>
                  setPosHw((s) => ({
                    ...s,
                    defaultPaymentMethod: e.target
                      .value as PosHardwareSettings['defaultPaymentMethod'],
                  }))
                }
                options={[
                  { value: 'cash', label: 'نقدي' },
                  { value: 'card', label: 'بطاقة' },
                  { value: 'pos', label: 'نقطة دفع' },
                  { value: 'wallet', label: 'محفظة' },
                  { value: 'transfer', label: 'تحويل' },
                  { value: 'credit', label: 'آجل' },
                ]}
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <label className="inline-flex items-center gap-2 rounded-xl border border-app px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  className="accent-[var(--primary)]"
                  checked={posHw.scanBeep}
                  onChange={(e) => setPosHw((s) => ({ ...s, scanBeep: e.target.checked }))}
                />
                صوت المسح / الإضافة
              </label>
              <label className="inline-flex items-center gap-2 rounded-xl border border-app px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  className="accent-[var(--primary)]"
                  checked={posHw.showDetailedAfterSale}
                  onChange={(e) =>
                    setPosHw((s) => ({ ...s, showDetailedAfterSale: e.target.checked }))
                  }
                />
                عرض الفاتورة بعد البيع
              </label>
            </div>
            <Button
              variant="soft"
              onClick={() => {
                const next = savePosSettings(posHw);
                setPosHw(next);
                setSaved(true);
                setTimeout(() => setSaved(false), 2000);
              }}
            >
              حفظ إعدادات الطابعة والجهاز
            </Button>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
