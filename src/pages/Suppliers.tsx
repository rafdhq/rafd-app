import { useEffect, useMemo, useState } from 'react';
import {
  FileDown,
  MessageCircle,
  Package,
  Plus,
  Search,
  Truck,
  Wallet,
} from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Dialog from '../components/ui/Dialog';
import Badge from '../components/ui/Badge';
import { Table, THead, TH, TBody, TD } from '../components/ui/Table';
import EmptyState from '../components/ui/EmptyState';
import { PageSkeleton } from '../components/ui/Skeleton';
import { useTenant } from '../contexts/TenantContext';
import type { Product, Purchase, Supplier, SupplierLedger } from '../lib/types';
import {
  COUNTRY_CODES,
  buildWhatsAppNumber,
  formatDateTime,
  formatMoney,
  shareWhatsApp,
} from '../lib/utils';

export default function Suppliers() {
  const { tenant } = useTenant();
  const currency = tenant?.currency || 'YER';
  const [items, setItems] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [selected, setSelected] = useState<Supplier | null>(null);
  const [ledger, setLedger] = useState<SupplierLedger[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [linkedProducts, setLinkedProducts] = useState<Product[]>([]);
  const [payAmount, setPayAmount] = useState(0);
  const [payNotes, setPayNotes] = useState('');
  const [form, setForm] = useState({
    name: '',
    countryCode: '+967',
    phoneLocal: '',
    email: '',
    notes: '',
  });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!tenant?.id) return;
    setLoading(true);
    const res = await fetch(`/api/suppliers?tenant_id=${tenant.id}`);
    if (res.ok) setItems(await res.json());
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [tenant?.id]);

  const filtered = useMemo(() => {
    if (!q.trim()) return items;
    const s = q.toLowerCase();
    return items.filter(
      (x) =>
        x.name?.toLowerCase().includes(s) ||
        x.phone?.includes(q) ||
        x.email?.toLowerCase().includes(s)
    );
  }, [items, q]);

  const save = async () => {
    if (!form.name) return;
    setBusy(true);
    const phone = buildWhatsAppNumber(form.countryCode, form.phoneLocal) || null;
    await fetch('/api/suppliers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        phone,
        email: form.email || null,
        notes: form.notes || null,
        tenant_id: tenant?.id,
        balance: 0,
      }),
    });
    setBusy(false);
    setOpen(false);
    setForm({ name: '', countryCode: '+967', phoneLocal: '', email: '', notes: '' });
    load();
  };

  const openAccount = async (s: Supplier) => {
    setSelected(s);
    setAccountOpen(true);
    const [lRes, pRes, prodRes] = await Promise.all([
      fetch(`/api/supplier-ledger?tenant_id=${tenant?.id}&supplier_id=${s.id}`),
      fetch(`/api/purchases?tenant_id=${tenant?.id}&supplier_id=${s.id}`),
      fetch(`/api/products?tenant_id=${tenant?.id}&supplier_id=${s.id}`),
    ]);
    if (lRes.ok) setLedger(await lRes.json());
    if (pRes.ok) setPurchases(await pRes.json());
    if (prodRes.ok) setLinkedProducts(await prodRes.json());
  };

  const collectPayment = async () => {
    if (!selected || !payAmount) return;
    setBusy(true);
    await fetch('/api/supplier-ledger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenant_id: tenant?.id,
        supplier_id: selected.id,
        type: 'payment',
        amount: payAmount,
        notes: payNotes || 'سداد للمورد',
        reference: `SPAY-${Date.now().toString().slice(-6)}`,
      }),
    });
    setBusy(false);
    setPayOpen(false);
    setPayAmount(0);
    setPayNotes('');
    await load();
    const updated = (await (await fetch(`/api/suppliers?tenant_id=${tenant?.id}`)).json()).find(
      (x: Supplier) => x.id === selected.id
    );
    if (updated) openAccount(updated);
  };

  const shareStatementWhatsApp = () => {
    if (!selected) return;
    const lines = [
      `كشف حساب مورد — ${tenant?.name_ar || tenant?.name || 'رفد'}`,
      `المورد: ${selected.name}`,
      `الرصيد المستحق: ${formatMoney(selected.balance, currency)}`,
      '────────',
      ...ledger.slice(0, 20).map(
        (r) =>
          `${formatDateTime(r.created_at)} | ${r.type === 'payment' ? 'سداد' : r.type === 'purchase_credit' ? 'مشترى' : r.type} | ${formatMoney(r.amount, currency)} | بعد: ${formatMoney(r.balance_after, currency)}`
      ),
      '────────',
      `منتجات مرتبطة: ${linkedProducts.length}`,
      `طلبيات: ${purchases.length}`,
    ];
    shareWhatsApp(selected.phone || '', lines.join('\n'));
  };

  const downloadStatementText = () => {
    if (!selected) return;
    const text = [
      `كشف حساب مورد`,
      `المتجر: ${tenant?.name_ar || ''}`,
      `المورد: ${selected.name}`,
      `الهاتف: ${selected.phone || '—'}`,
      `الرصيد: ${formatMoney(selected.balance, currency)}`,
      '',
      'الحركات:',
      ...ledger.map(
        (r) =>
          `${r.created_at || ''} | ${r.type} | ${r.amount} | bal ${r.balance_after} | ${r.reference || ''} | ${r.notes || ''}`
      ),
      '',
      'المنتجات:',
      ...linkedProducts.map((p) => `- ${p.name_ar || p.name} (${p.sku})`),
      '',
      'الطلبيات:',
      ...purchases.map(
        (p) =>
          `${p.reference} | ${p.purchase_date} | ${p.status} | total ${p.total} | paid ${p.paid}`
      ),
    ].join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `supplier-statement-${selected.id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <PageSkeleton />;

  return (
    <div>
      <PageHeader
        title="الموردون وكشوف الحساب"
        description="ربط المنتجات · أرصدة · سداد · مشاركة واتساب"
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> مورد جديد
          </Button>
        }
      />

      <div className="mb-4 relative max-w-md">
        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="بحث عن مورد بالاسم أو الجوال..."
          className="h-11 w-full rounded-xl border border-app bg-surface pe-10 ps-3 text-sm shadow-soft focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
        />
      </div>

      {!filtered.length ? (
        <EmptyState icon={Truck} title="لا يوجد موردون" actionLabel="إضافة" onAction={() => setOpen(true)} />
      ) : (
        <Table>
          <THead>
            <TH>الاسم</TH>
            <TH>واتساب</TH>
            <TH>البريد</TH>
            <TH>المستحق علينا</TH>
            <TH></TH>
          </THead>
          <TBody>
            {filtered.map((s) => (
              <tr key={s.id}>
                <TD className="font-medium">{s.name}</TD>
                <TD dir="ltr">{s.phone || '—'}</TD>
                <TD>{s.email || '—'}</TD>
                <TD className="tabular">
                  <Badge tone={Number(s.balance) > 0 ? 'warning' : 'success'}>
                    {formatMoney(s.balance, currency)}
                  </Badge>
                </TD>
                <TD>
                  <div className="flex flex-wrap gap-1">
                    <Button size="sm" variant="outline" onClick={() => openAccount(s)}>
                      الحساب
                    </Button>
                    <Button
                      size="sm"
                      variant="soft"
                      onClick={() => {
                        setSelected(s);
                        setPayAmount(Number(s.balance) || 0);
                        setPayOpen(true);
                      }}
                    >
                      <Wallet className="h-3.5 w-3.5" />
                      سداد
                    </Button>
                    {s.phone && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          shareWhatsApp(
                            s.phone || '',
                            `مرحباً ${s.name}، رصيدكم الحالي لدينا: ${formatMoney(s.balance, currency)}`
                          )
                        }
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                      </Button>
                    )}
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
        title="مورد جديد"
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
          <div className="grid grid-cols-[140px_1fr] gap-2">
            <Select
              label="الدولة"
              value={form.countryCode}
              onChange={(e) => setForm({ ...form, countryCode: e.target.value })}
              options={COUNTRY_CODES.map((c) => ({
                value: c.code,
                label: `${c.flag} ${c.code}`,
              }))}
            />
            <Input
              label="رقم الواتساب"
              value={form.phoneLocal}
              onChange={(e) => setForm({ ...form, phoneLocal: e.target.value })}
              placeholder="7xxxxxxxx"
              dir="ltr"
            />
          </div>
          <Input label="البريد" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input label="ملاحظات" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
      </Dialog>

      <Dialog
        open={accountOpen}
        onClose={() => setAccountOpen(false)}
        title={`حساب المورد — ${selected?.name || ''}`}
        description={`المستحق: ${formatMoney(selected?.balance || 0, currency)}`}
        size="xl"
        footer={
          <div className="flex flex-wrap justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={downloadStatementText}>
                <FileDown className="h-4 w-4" />
                تنزيل الكشف
              </Button>
              <Button variant="soft" onClick={shareStatementWhatsApp}>
                <MessageCircle className="h-4 w-4" />
                واتساب
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
                سداد
              </Button>
              <Button onClick={() => setAccountOpen(false)}>إغلاق</Button>
            </div>
          </div>
        }
      >
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <h4 className="mb-2 text-sm font-semibold text-app">حركة الحساب</h4>
            {!ledger.length ? (
              <div className="text-sm text-muted">لا توجد حركات</div>
            ) : (
              <div className="max-h-64 space-y-2 overflow-y-auto">
                {ledger.map((row) => (
                  <div
                    key={row.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-app px-3 py-2 text-sm"
                  >
                    <div>
                      <div className="font-medium">
                        {row.type === 'purchase_credit'
                          ? 'مشترى / طلبية'
                          : row.type === 'payment'
                            ? 'سداد'
                            : row.type}
                      </div>
                      <div className="text-xs text-muted">
                        {row.reference || '—'} · {formatDateTime(row.created_at)}
                      </div>
                    </div>
                    <div className="text-end">
                      <div
                        className={`font-semibold tabular ${row.type === 'payment' ? 'text-success' : 'text-warning'}`}
                      >
                        {row.type === 'payment' ? '-' : '+'}
                        {formatMoney(row.amount, currency)}
                      </div>
                      <div className="text-xs text-muted">بعد: {formatMoney(row.balance_after, currency)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-app">
                <Package className="h-4 w-4" />
                منتجات المورد ({linkedProducts.length})
              </h4>
              {!linkedProducts.length ? (
                <div className="text-sm text-muted">اربط المنتجات من شاشة المنتجات</div>
              ) : (
                <div className="max-h-40 space-y-1 overflow-y-auto">
                  {linkedProducts.map((p) => (
                    <div key={p.id} className="rounded-lg bg-muted px-3 py-2 text-sm">
                      {p.name_ar || p.name}
                      <span className="ms-2 text-xs text-muted">{p.sku}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <h4 className="mb-2 text-sm font-semibold text-app">الطلبيات</h4>
              {!purchases.length ? (
                <div className="text-sm text-muted">لا طلبيات</div>
              ) : (
                <div className="max-h-40 space-y-1 overflow-y-auto">
                  {purchases.map((p) => (
                    <div key={p.id} className="flex justify-between rounded-lg bg-muted px-3 py-2 text-sm">
                      <span className="font-mono text-xs">{p.reference}</span>
                      <span className="tabular font-semibold">{formatMoney(p.total, currency)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title={`سداد إلى ${selected?.name || ''}`}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setPayOpen(false)}>
              إلغاء
            </Button>
            <Button loading={busy} onClick={collectPayment}>
              تأكيد السداد
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
