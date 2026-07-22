import { useEffect, useMemo, useState } from 'react';
import {
  FileDown,
  Image as ImageIcon,
  MessageCircle,
  Plus,
  Printer,
  Search,
  Users,
  Wallet,
} from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Dialog from '../components/ui/Dialog';
import Badge from '../components/ui/Badge';
import PhoneWhatsAppField from '../components/ui/PhoneWhatsAppField';
import CustomerStatementDoc from '../components/ui/CustomerStatementDoc';
import { Table, THead, TH, TBody, TD } from '../components/ui/Table';
import EmptyState from '../components/ui/EmptyState';
import { PageSkeleton } from '../components/ui/Skeleton';
import { useTenant } from '../contexts/TenantContext';
import type { Customer, CustomerLedger, Sale } from '../lib/types';
import { buildWhatsAppNumber, formatMoney } from '../lib/utils';
import { buildStatementWhatsAppText, downloadCustomerStatementPdf } from '../lib/pdf';
import {
  downloadElementAsPng,
  openWhatsAppWithText,
  printElement,
  shareWhatsAppSummaryImage,
} from '../lib/documentExport';
import {
  computeStatementSlice,
  resolvePeriod,
  type PeriodPreset,
} from '../lib/statementPeriod';

const FULL_DOC_ID = 'customer-statement-full';
const SUMMARY_DOC_ID = 'customer-statement-summary';

export default function Customers() {
  const { tenant } = useTenant();
  const currency = tenant?.currency || 'YER';
  const [items, setItems] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [ledger, setLedger] = useState<CustomerLedger[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [payAmount, setPayAmount] = useState(0);
  const [payNotes, setPayNotes] = useState('');
  const [exporting, setExporting] = useState('');
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [form, setForm] = useState({
    name: '',
    countryCode: '+967',
    localPhone: '',
    email: '',
    notes: '',
  });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!tenant?.id) return;
    setLoading(true);
    const res = await fetch(`/api/customers?tenant_id=${tenant.id}`);
    if (res.ok) setItems(await res.json());
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [tenant?.id]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter(
      (c) =>
        c.name?.toLowerCase().includes(s) ||
        c.phone?.includes(q) ||
        c.email?.toLowerCase().includes(s) ||
        c.notes?.toLowerCase().includes(s)
    );
  }, [items, q]);

  const period = useMemo(
    () => resolvePeriod(periodPreset, customFrom, customTo),
    [periodPreset, customFrom, customTo]
  );

  const slice = useMemo(
    () => computeStatementSlice(ledger, sales, period),
    [ledger, sales, period]
  );

  const productLinesCount = useMemo(
    () => slice.periodSales.reduce((a, s) => a + (s.items?.length || 0), 0),
    [slice.periodSales]
  );

  const save = async () => {
    if (!form.name) return;
    setBusy(true);
    const phone = buildWhatsAppNumber(form.countryCode, form.localPhone);
    await fetch('/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        phone: phone || null,
        email: form.email || null,
        notes: form.notes || null,
        tenant_id: tenant?.id,
        balance: 0,
        total_purchases: 0,
      }),
    });
    setBusy(false);
    setOpen(false);
    setForm({ name: '', countryCode: '+967', localPhone: '', email: '', notes: '' });
    load();
  };

  const openAccount = async (c: Customer) => {
    setSelected(c);
    setAccountOpen(true);
    setPeriodPreset('all');
    setCustomFrom('');
    setCustomTo('');
    const [lRes, sRes] = await Promise.all([
      fetch(`/api/customer-ledger?tenant_id=${tenant?.id}&customer_id=${c.id}`),
      fetch(`/api/sales?tenant_id=${tenant?.id}&customer_id=${c.id}&include_items=1`),
    ]);
    if (lRes.ok) setLedger(await lRes.json());
    if (sRes.ok) setSales(await sRes.json());
  };

  const collectPayment = async () => {
    if (!selected || !payAmount) return;
    setBusy(true);
    await fetch('/api/customer-ledger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenant_id: tenant?.id,
        customer_id: selected.id,
        type: 'payment',
        amount: payAmount,
        notes: payNotes || 'تحصيل من العميل',
        reference: `PAY-${Date.now().toString().slice(-6)}`,
      }),
    });
    setBusy(false);
    setPayOpen(false);
    setPayAmount(0);
    setPayNotes('');
    await load();
    const updated = (await (await fetch(`/api/customers?tenant_id=${tenant?.id}`)).json()).find(
      (x: Customer) => x.id === selected.id
    );
    if (updated) openAccount(updated);
  };

  const statementText = () => {
    if (!selected) return '';
    return buildStatementWhatsAppText({
      tenantName: tenant?.name_ar || tenant?.name || 'رفد',
      customerName: selected.name,
      phone: selected.phone,
      openingBalance: slice.showOpening ? slice.openingBalance : undefined,
      closingBalance: slice.closingBalance,
      periodDebit: slice.periodDebit,
      periodCredit: slice.periodCredit,
      periodLabel: period.label,
      currency,
      invoicesCount: slice.periodSales.length,
      productsLines: productLinesCount,
    });
  };

  const exportPdf = async () => {
    if (!selected) return;
    const el = document.getElementById(FULL_DOC_ID) as HTMLElement | null;
    if (!el) return;
    setExporting('pdf');
    try {
      await downloadCustomerStatementPdf({
        tenant,
        customer: selected,
        ledger: slice.periodLedger,
        sales: slice.periodSales,
        currency,
        element: el,
        periodLabel: period.label,
      });
    } finally {
      setExporting('');
    }
  };

  /** Image for gallery: one-page summary only */
  const exportSummaryImage = async () => {
    if (!selected) return;
    const el = document.getElementById(SUMMARY_DOC_ID) as HTMLElement | null;
    if (!el) return;
    setExporting('image');
    try {
      await downloadElementAsPng(el, `rafd-statement-summary-${selected.id}-${Date.now()}.png`);
    } finally {
      setExporting('');
    }
  };

  /** WhatsApp: summary image (single page) + short text — NOT the full multipage doc */
  const shareWhatsApp = async () => {
    if (!selected) return;
    const el = document.getElementById(SUMMARY_DOC_ID) as HTMLElement | null;
    if (!el) return;
    setExporting('wa');
    try {
      await shareWhatsAppSummaryImage({
        summaryElement: el,
        phone: selected.phone,
        text: statementText(),
        baseName: `rafd-statement-summary-${selected.id}-${Date.now()}`,
      });
    } finally {
      setExporting('');
    }
  };

  const handlePrint = async () => {
    const el = document.getElementById(FULL_DOC_ID) as HTMLElement | null;
    if (!el) return;
    setExporting('print');
    try {
      await printElement(el);
    } finally {
      setExporting('');
    }
  };

  if (loading) return <PageSkeleton />;

  return (
    <div>
      <PageHeader
        title="العملاء وحساباتهم"
        description="كشف حساب تفصيلي بالمنتجات · فترة محددة · رصيد سابق · واتساب ملخص صفحة واحدةحدة · PDF متعدد الصفحات"
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> عميل جديد
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full min-w-0 flex-1 sm:max-w-md">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ابحث بالاسم أو رقم الواتساب..."
            className="h-11 w-full rounded-xl border border-app bg-surface pe-10 ps-3 text-sm shadow-soft focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
          />
        </div>
        <Badge tone="primary" className="self-start">
          {filtered.length} عميل
        </Badge>
      </div>

      {!items.length ? (
        <EmptyState icon={Users} title="لا يوجد عملاء" actionLabel="إضافة" onAction={() => setOpen(true)} />
      ) : !filtered.length ? (
        <EmptyState icon={Search} title="لا نتائج" description="جرّب اسماً أو رقماً آخر" />
      ) : (
        <Table>
          <THead>
            <TH>الاسم</TH>
            <TH>واتساب</TH>
            <TH>البريد</TH>
            <TH>رصيد آجل</TH>
            <TH>إجمالي المشتريات</TH>
            <TH></TH>
          </THead>
          <TBody>
            {filtered.map((c) => (
              <tr key={c.id}>
                <TD className="font-medium">{c.name}</TD>
                <TD dir="ltr">{c.phone || '—'}</TD>
                <TD>{c.email || '—'}</TD>
                <TD className="tabular">
                  <Badge tone={Number(c.balance) > 0 ? 'warning' : 'success'}>
                    {formatMoney(c.balance, currency)}
                  </Badge>
                </TD>
                <TD className="tabular">{formatMoney(c.total_purchases, currency)}</TD>
                <TD className="whitespace-nowrap">
                  <div className="flex flex-wrap gap-1">
                    <Button size="sm" variant="outline" onClick={() => openAccount(c)}>
                      كشف الحساب
                    </Button>
                    <Button
                      size="sm"
                      variant="soft"
                      onClick={() => {
                        setSelected(c);
                        setPayAmount(Number(c.balance) || 0);
                        setPayOpen(true);
                      }}
                    >
                      <Wallet className="h-3.5 w-3.5" />
                      تحصيل
                    </Button>
                  </div>
                </TD>
              </tr>
            ))}
          </TBody>
        </Table>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="عميل جديد"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
            <Button loading={busy} onClick={save}>
              حفظ
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Input label="الاسم" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <PhoneWhatsAppField
            countryCode={form.countryCode}
            localPhone={form.localPhone}
            onCountryChange={(code) => setForm({ ...form, countryCode: code })}
            onLocalChange={(local) => setForm({ ...form, localPhone: local })}
          />
          <Input label="البريد" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input label="ملاحظات" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
      </Dialog>

      <Dialog
        open={accountOpen}
        onClose={() => setAccountOpen(false)}
        title={`كشف حساب — ${selected?.name || ''}`}
        description="PDF تفصيلي بالمنتجات · واتساب: ملخص صفحة واحدةحدة فقط · طباعة متعددة الصفحات"
        size="xl"
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" loading={exporting === 'pdf'} onClick={exportPdf}>
                <FileDown className="h-4 w-4" />
                PDF تفصيلي
              </Button>
              <Button variant="outline" loading={exporting === 'print'} onClick={handlePrint}>
                <Printer className="h-4 w-4" />
                طباعة
              </Button>
              <Button variant="outline" loading={exporting === 'image'} onClick={exportSummaryImage}>
                <ImageIcon className="h-4 w-4" />
                صورة ملخص
              </Button>
              <Button variant="soft" loading={exporting === 'wa'} onClick={shareWhatsApp}>
                <MessageCircle className="h-4 w-4" />
                واتساب (ملخص صفحة واحدةحدة)
              </Button>
              <Button variant="ghost" onClick={() => openWhatsAppWithText(selected?.phone, statementText())}>
                نص فقط
              </Button>
            </div>
            <div className="flex gap-2">
              <Button
                variant="soft"
                onClick={() => {
                  setPayAmount(Number(selected?.balance) || 0);
                  setPayOpen(true);
                }}
              >
                تحصيل
              </Button>
              <Button onClick={() => setAccountOpen(false)}>إغلاق</Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Period filters */}
          <div className="rounded-2xl border border-app bg-subtle p-4">
            <div className="mb-3 text-sm font-semibold text-app">فترة كشف الحساب</div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Select
                label="الفترة"
                value={periodPreset}
                onChange={(e) => setPeriodPreset(e.target.value as PeriodPreset)}
                options={[
                  { value: 'all', label: 'كل الفترات' },
                  { value: 'today', label: 'خلال اليوم' },
                  { value: 'month', label: 'هذا الشهر' },
                  { value: 'year', label: 'هذه السنة' },
                  { value: 'custom', label: 'فترة مخصصة' },
                ]}
              />
              {periodPreset === 'custom' && (
                <>
                  <Input
                    label="من تاريخ"
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                  />
                  <Input
                    label="إلى تاريخ"
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                  />
                </>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <Badge tone="info">{period.label}</Badge>
              {slice.showOpening && (
                <Badge tone="warning">
                  رصيد سابق: {formatMoney(slice.openingBalance, currency)}
                </Badge>
              )}
              <Badge tone="primary">
                ختامي: {formatMoney(slice.closingBalance, currency)}
              </Badge>
              <Badge tone="default">{slice.periodSales.length} فاتورة</Badge>
              <Badge tone="default">{productLinesCount} صنف</Badge>
            </div>
          </div>

          {selected && (
            <>
              {/* Full detailed doc (PDF / print) */}
              <div className="overflow-x-auto rounded-2xl bg-muted/40 p-3">
                <div className="mb-2 text-xs font-medium text-muted">المستند التفصيلي (PDF / طباعة)</div>
                <CustomerStatementDoc
                  docId={FULL_DOC_ID}
                  mode="full"
                  tenant={tenant}
                  customer={selected}
                  ledger={slice.periodLedger}
                  sales={slice.periodSales}
                  currency={currency}
                  periodLabel={period.label}
                  openingBalance={slice.openingBalance}
                  closingBalance={slice.closingBalance}
                  showOpening={slice.showOpening}
                  periodDebit={slice.periodDebit}
                  periodCredit={slice.periodCredit}
                />
              </div>

              {/* Hidden/visible one-page summary for WhatsApp */}
              <div className="overflow-x-auto rounded-2xl border border-dashed border-primary/30 bg-primary-soft/20 p-3">
                <div className="mb-2 text-xs font-medium text-primary">
                  ملخص صفحة واحدةحدة — يُشارك عبر واتساب كصورة فقط
                </div>
                <CustomerStatementDoc
                  docId={SUMMARY_DOC_ID}
                  mode="summary"
                  tenant={tenant}
                  customer={selected}
                  ledger={slice.periodLedger}
                  sales={slice.periodSales}
                  currency={currency}
                  periodLabel={period.label}
                  openingBalance={slice.openingBalance}
                  closingBalance={slice.closingBalance}
                  showOpening={slice.showOpening}
                  periodDebit={slice.periodDebit}
                  periodCredit={slice.periodCredit}
                />
              </div>
            </>
          )}
        </div>
      </Dialog>

      <Dialog
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title={`تحصيل من ${selected?.name || ''}`}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setPayOpen(false)}>
              إلغاء
            </Button>
            <Button loading={busy} onClick={collectPayment}>
              تأكيد التحصيل
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Input
            label="المبلغ"
            type="number"
            value={payAmount}
            onChange={(e) => setPayAmount(Number(e.target.value) || 0)}
          />
          <Input label="ملاحظات" value={payNotes} onChange={(e) => setPayNotes(e.target.value)} />
        </div>
      </Dialog>
    </div>
  );
}
