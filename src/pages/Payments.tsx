import { useEffect, useMemo, useState } from 'react';
import { Building2, Nfc, Plus, Trash2 } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Table, THead, TH, TBody, TD } from '../components/ui/Table';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Dialog from '../components/ui/Dialog';
import { PageSkeleton } from '../components/ui/Skeleton';
import { DonutChart } from '../components/ui/Chart';
import { useTenant } from '../contexts/TenantContext';
import type { BankAccount, PaymentTerminal, Sale } from '../lib/types';
import { formatDateTime, formatMoney, paymentMethodLabel } from '../lib/utils';

export default function Payments() {
  const { tenant } = useTenant();
  const currency = tenant?.currency || 'YER';
  const [items, setItems] = useState<Sale[]>([]);
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [terminals, setTerminals] = useState<PaymentTerminal[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [termOpen, setTermOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    bank_name: '',
    account_name: '',
    account_number: '',
    iban: '',
    notes: '',
  });
  const [termForm, setTermForm] = useState({
    name: '',
    provider: 'network',
    terminal_id: '',
    connection_type: 'usb',
    supports_contactless: true,
    notes: '',
  });

  const load = async () => {
    if (!tenant?.id) return;
    setLoading(true);
    const [sRes, bRes, tRes] = await Promise.all([
      fetch(`/api/sales?tenant_id=${tenant.id}`),
      fetch(`/api/bank-accounts?tenant_id=${tenant.id}`),
      fetch(`/api/payment-terminals?tenant_id=${tenant.id}`),
    ]);
    if (sRes.ok) setItems((await sRes.json()).filter((s: Sale) => s.status === 'completed'));
    if (bRes.ok) setBanks(await bRes.json());
    if (tRes.ok) setTerminals(await tRes.json());
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [tenant?.id]);

  const breakdown = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of items) {
      const raw = String(s.payment_method || 'cash');
      let key = raw.split(':')[0];
      if (key === 'credit' || key === 'ajil') key = 'credit';
      if (key === 'pos') key = 'pos';
      map[key] = (map[key] || 0) + Number(s.paid || (key === 'credit' ? 0 : s.total) || 0);
    }
    return Object.entries(map).map(([label, value], i) => ({
      label: paymentMethodLabel(label),
      value: Math.round(value),
      color: `var(--chart-${(i % 5) + 1})`,
    }));
  }, [items]);

  const total = items.reduce((a, s) => a + Number(s.paid || 0), 0);
  const creditTotal = items
    .filter((s) => String(s.payment_method).startsWith('credit') || s.payment_method === 'ajil')
    .reduce((a, s) => a + Math.max(0, Number(s.total) - Number(s.paid || 0)), 0);

  const saveBank = async () => {
    if (!form.bank_name || !form.account_name) return;
    setBusy(true);
    await fetch('/api/bank-accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        tenant_id: tenant?.id,
        currency,
        is_active: true,
      }),
    });
    setBusy(false);
    setOpen(false);
    setForm({ bank_name: '', account_name: '', account_number: '', iban: '', notes: '' });
    load();
  };

  const saveTerminal = async () => {
    if (!termForm.name) return;
    setBusy(true);
    await fetch('/api/payment-terminals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...termForm,
        tenant_id: tenant?.id,
        is_active: true,
      }),
    });
    setBusy(false);
    setTermOpen(false);
    setTermForm({
      name: '',
      provider: 'network',
      terminal_id: '',
      connection_type: 'usb',
      supports_contactless: true,
      notes: '',
    });
    load();
  };

  const removeBank = async (id: number) => {
    if (!confirm('حذف الحساب البنكي؟')) return;
    await fetch('/api/bank-accounts', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    load();
  };

  const removeTerminal = async (id: number) => {
    if (!confirm('حذف نقطة الدفع؟')) return;
    await fetch('/api/payment-terminals', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    load();
  };

  if (loading) return <PageSkeleton />;

  return (
    <div>
      <PageHeader
        title="المدفوعات ونقاط الدفع"
        description="حسابات بنكية · أجهزة شبكة · محافظ · سجل التحصيل"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setTermOpen(true)}>
              <Nfc className="h-4 w-4" /> نقطة دفع
            </Button>
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" /> حساب بنكي
            </Button>
          </div>
        }
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardBody>
            <div className="text-sm text-muted">المحصّل</div>
            <div className="mt-1 text-2xl font-bold tabular">{formatMoney(total, currency)}</div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="text-sm text-muted">آجل غير محصّل</div>
            <div className="mt-1 text-2xl font-bold tabular text-warning">
              {formatMoney(creditTotal, currency)}
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="text-sm text-muted">حسابات بنكية</div>
            <div className="mt-1 text-2xl font-bold">{banks.filter((b) => b.is_active).length}</div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="text-sm text-muted">نقاط دفع نشطة</div>
            <div className="mt-1 text-2xl font-bold">{terminals.filter((t) => t.is_active).length}</div>
          </CardBody>
        </Card>
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="توزيع التحصيل" description={`الإجمالي ${formatMoney(total, currency)}`} />
          <CardBody>
            <DonutChart
              segments={
                breakdown.length
                  ? breakdown
                  : [{ label: 'لا بيانات', value: 1, color: 'var(--border)' }]
              }
              centerValue={formatMoney(total, currency)}
              centerLabel="محصّل"
            />
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="الحسابات البنكية"
            description="تظهر عند اختيار التحويل البنكي في نقطة البيع"
          />
          <CardBody className="space-y-3">
            {!banks.length && (
              <div className="rounded-2xl border border-dashed border-app px-4 py-8 text-center text-sm text-muted">
                أضف حسابات كاك بنك، التضامن، الكريمي، بنوك سعودية...
              </div>
            )}
            {banks.map((b) => (
              <div
                key={b.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-app bg-subtle p-4"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft text-primary">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-semibold text-app">{b.bank_name}</div>
                    <div className="text-sm text-secondary">{b.account_name}</div>
                    <div className="mt-1 font-mono text-xs text-muted" dir="ltr">
                      {b.account_number || b.iban || '—'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={b.is_active ? 'success' : 'default'}>
                    {b.is_active ? 'نشط' : 'موقوف'}
                  </Badge>
                  <Button variant="ghost" size="icon" onClick={() => removeBank(b.id)}>
                    <Trash2 className="h-4 w-4 text-danger" />
                  </Button>
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      <Card className="mb-4">
        <CardHeader
          title="أجهزة نقاط الدفع (POS Terminals)"
          description="مدى · فيزا · ماستركارد · لمس NFC · شبكة محلية"
          action={
            <Button size="sm" variant="outline" onClick={() => setTermOpen(true)}>
              <Plus className="h-4 w-4" /> إضافة
            </Button>
          }
        />
        <CardBody className="grid gap-3 sm:grid-cols-2">
          {!terminals.length && (
            <div className="sm:col-span-2 rounded-2xl border border-dashed border-app px-4 py-8 text-center text-sm text-muted">
              أضف جهاز شبكة / نقطة دفع ليظهر في شاشة الدفع
            </div>
          )}
          {terminals.map((t) => (
            <div
              key={t.id}
              className="flex items-start justify-between gap-3 rounded-2xl border border-app bg-subtle p-4"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-info-soft text-info">
                  <Nfc className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-semibold text-app">{t.name}</div>
                  <div className="text-sm text-secondary">
                    {t.provider} · {t.connection_type}
                  </div>
                  <div className="mt-1 text-xs text-muted" dir="ltr">
                    ID: {t.terminal_id || '—'}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {t.supports_contactless && <Badge tone="info">NFC / لمس</Badge>}
                    <Badge tone={t.is_active ? 'success' : 'default'}>
                      {t.is_active ? 'نشط' : 'موقوف'}
                    </Badge>
                  </div>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => removeTerminal(t.id)}>
                <Trash2 className="h-4 w-4 text-danger" />
              </Button>
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="سجل التحصيل" />
        <CardBody className="pt-0">
          <Table className="border-0">
            <THead>
              <TH>الفاتورة</TH>
              <TH>الوسيلة</TH>
              <TH>المبلغ</TH>
              <TH>المدفوع</TH>
              <TH>الوقت</TH>
            </THead>
            <TBody>
              {items.slice(0, 40).map((s) => (
                <tr key={s.id}>
                  <TD className="font-mono text-xs">{s.invoice_number}</TD>
                  <TD>
                    <Badge
                      tone={
                        String(s.payment_method).startsWith('credit')
                          ? 'warning'
                          : String(s.payment_method).startsWith('pos') ||
                              String(s.payment_method).startsWith('card')
                            ? 'info'
                            : 'success'
                      }
                    >
                      {paymentMethodLabel(s.payment_method)}
                    </Badge>
                  </TD>
                  <TD className="tabular font-semibold">{formatMoney(s.total, currency)}</TD>
                  <TD className="tabular">{formatMoney(s.paid, currency)}</TD>
                  <TD>{formatDateTime(s.created_at)}</TD>
                </tr>
              ))}
            </TBody>
          </Table>
        </CardBody>
      </Card>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="إضافة حساب بنكي"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
            <Button loading={busy} onClick={saveBank}>
              حفظ
            </Button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="اسم البنك"
            value={form.bank_name}
            onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
            placeholder="كاك بنك / التضامن / الأهلي..."
          />
          <Input
            label="اسم الحساب"
            value={form.account_name}
            onChange={(e) => setForm({ ...form, account_name: e.target.value })}
          />
          <Input
            label="رقم الحساب"
            value={form.account_number}
            onChange={(e) => setForm({ ...form, account_number: e.target.value })}
          />
          <Input
            label="IBAN"
            value={form.iban}
            onChange={(e) => setForm({ ...form, iban: e.target.value })}
          />
          <div className="sm:col-span-2">
            <Input
              label="ملاحظات"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </div>
      </Dialog>

      <Dialog
        open={termOpen}
        onClose={() => setTermOpen(false)}
        title="إضافة نقطة دفع"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setTermOpen(false)}>
              إلغاء
            </Button>
            <Button loading={busy} onClick={saveTerminal}>
              حفظ
            </Button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="اسم الجهاز"
            value={termForm.name}
            onChange={(e) => setTermForm({ ...termForm, name: e.target.value })}
            placeholder="جهاز الصندوق 1"
          />
          <Select
            label="المزوّد / النوع"
            value={termForm.provider}
            onChange={(e) => setTermForm({ ...termForm, provider: e.target.value })}
            options={[
              { value: 'network', label: 'شبكة محلية' },
              { value: 'mada', label: 'مدى' },
              { value: 'nearpay', label: 'NearPay' },
              { value: 'geidea', label: 'Geidea' },
              { value: 'foodics', label: 'Foodics Pay' },
              { value: 'generic', label: 'عام / يدوي' },
            ]}
          />
          <Input
            label="رقم الجهاز / Terminal ID"
            value={termForm.terminal_id}
            onChange={(e) => setTermForm({ ...termForm, terminal_id: e.target.value })}
          />
          <Select
            label="نوع الاتصال"
            value={termForm.connection_type}
            onChange={(e) => setTermForm({ ...termForm, connection_type: e.target.value })}
            options={[
              { value: 'usb', label: 'USB' },
              { value: 'bluetooth', label: 'Bluetooth' },
              { value: 'network', label: 'شبكة / IP' },
              { value: 'cloud', label: 'سحابي' },
              { value: 'manual', label: 'يدوي' },
            ]}
          />
          <label className="flex items-center gap-2 rounded-xl border border-app px-3 py-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              className="accent-[var(--primary)]"
              checked={termForm.supports_contactless}
              onChange={(e) =>
                setTermForm({ ...termForm, supports_contactless: e.target.checked })
              }
            />
            يدعم الدفع باللمس (NFC / Contactless)
          </label>
          <div className="sm:col-span-2">
            <Input
              label="ملاحظات"
              value={termForm.notes}
              onChange={(e) => setTermForm({ ...termForm, notes: e.target.value })}
            />
          </div>
        </div>
      </Dialog>
    </div>
  );
}
