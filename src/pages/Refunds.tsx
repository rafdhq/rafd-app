import { useEffect, useState } from 'react';
import { RotateCcw, Search } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Badge from '../components/ui/Badge';
import Dialog from '../components/ui/Dialog';
import { Table, THead, TH, TBody, TD } from '../components/ui/Table';
import { PageSkeleton } from '../components/ui/Skeleton';
import { useTenant } from '../contexts/TenantContext';
import type { Sale, SaleItem } from '../lib/types';
import { formatDateTime, formatMoney, paymentMethodLabel } from '../lib/utils';

export default function Refunds() {
  const { tenant } = useTenant();
  const currency = tenant?.currency || 'YER';
  const [q, setQ] = useState('');
  const [sales, setSales] = useState<Sale[]>([]);
  const [refunds, setRefunds] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<(Sale & { items?: SaleItem[] }) | null>(null);
  const [qtyMap, setQtyMap] = useState<Record<number, number>>({});
  const [reason, setReason] = useState('');
  const [mode, setMode] = useState<'refund' | 'exchange'>('refund');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!tenant?.id) return;
    setLoading(true);
    const [sRes, rRes] = await Promise.all([
      fetch(`/api/sales?tenant_id=${tenant.id}`),
      fetch(`/api/refunds?tenant_id=${tenant.id}`),
    ]);
    if (sRes.ok) setSales(await sRes.json());
    if (rRes.ok) setRefunds(await rRes.json());
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [tenant?.id]);

  const openSale = async (s: Sale) => {
    const res = await fetch(`/api/sales?id=${s.id}&tenant_id=${tenant?.id}`);
    if (!res.ok) return;
    const full = await res.json();
    setSelected(full);
    const map: Record<number, number> = {};
    for (const it of full.items || []) map[it.id!] = 0;
    setQtyMap(map);
    setReason('');
    setMode('refund');
  };

  const submit = async () => {
    if (!selected) return;
    const items = (selected.items || [])
      .filter((it) => Number(qtyMap[it.id!] || 0) > 0)
      .map((it) => ({
        sale_item_id: it.id,
        product_id: it.product_id,
        quantity: Number(qtyMap[it.id!]),
      }));
    if (!items.length) return;
    setBusy(true);
    const res = await fetch('/api/refunds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenant_id: tenant?.id,
        sale_id: selected.id,
        items,
        mode,
        reason,
        refund_method: 'cash',
      }),
    });
    setBusy(false);
    if (res.ok) {
      setSelected(null);
      load();
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.error || 'فشل المرتجع');
    }
  };

  const filtered = sales.filter((s) => {
    if (!q) return s.status === 'completed' || s.status === 'partial_refund';
    return (
      (s.status === 'completed' || s.status === 'partial_refund') &&
      (s.invoice_number?.includes(q) || s.customer_name?.includes(q))
    );
  });

  if (loading) return <PageSkeleton />;

  return (
    <div>
      <PageHeader title="المرتجعات والاستبدال" description="إرجاع كميات مع إعادة للمخزون وتسوية الآجل" />

      <div className="mb-4 relative max-w-md">
        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="بحث برقم الفاتورة أو العميل..."
          className="h-11 w-full rounded-xl border border-app bg-surface pe-10 ps-3 text-sm"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold">فواتير قابلة للإرجاع</h3>
          <Table>
            <THead>
              <TH>الفاتورة</TH>
              <TH>العميل</TH>
              <TH>الإجمالي</TH>
              <TH></TH>
            </THead>
            <TBody>
              {filtered.slice(0, 40).map((s) => (
                <tr key={s.id}>
                  <TD className="font-mono text-xs">{s.invoice_number}</TD>
                  <TD>{s.customer_name}</TD>
                  <TD className="tabular">{formatMoney(s.total, currency)}</TD>
                  <TD>
                    <Button size="sm" variant="outline" onClick={() => openSale(s)}>
                      <RotateCcw className="h-3.5 w-3.5" /> إرجاع
                    </Button>
                  </TD>
                </tr>
              ))}
            </TBody>
          </Table>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold">سجل المرتجعات</h3>
          <Table>
            <THead>
              <TH>الفاتورة</TH>
              <TH>النوع</TH>
              <TH>المبلغ</TH>
              <TH>الوقت</TH>
            </THead>
            <TBody>
              {refunds.map((r) => (
                <tr key={String(r.id)}>
                  <TD className="font-mono text-xs">{String(r.invoice_number)}</TD>
                  <TD>
                    <Badge tone={r.mode === 'exchange' ? 'accent' : 'warning'}>
                      {r.mode === 'exchange' ? 'استبدال' : 'مرتجع'}
                    </Badge>
                  </TD>
                  <TD className="tabular">{formatMoney(Number(r.amount), currency)}</TD>
                  <TD className="text-xs">{formatDateTime(String(r.created_at))}</TD>
                </tr>
              ))}
            </TBody>
          </Table>
        </div>
      </div>

      <Dialog
        open={!!selected}
        onClose={() => setSelected(null)}
        title={`مرتجع — ${selected?.invoice_number || ''}`}
        description={selected ? `${selected.customer_name} · ${paymentMethodLabel(selected.payment_method)}` : ''}
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setSelected(null)}>إلغاء</Button>
            <Button loading={busy} onClick={submit}>تأكيد</Button>
          </div>
        }
      >
        <div className="mb-3 flex gap-2">
          <Button size="sm" variant={mode === 'refund' ? 'primary' : 'outline'} onClick={() => setMode('refund')}>مرتجع</Button>
          <Button size="sm" variant={mode === 'exchange' ? 'primary' : 'outline'} onClick={() => setMode('exchange')}>استبدال</Button>
        </div>
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {(selected?.items || []).map((it) => (
            <div key={it.id} className="flex items-center justify-between gap-3 rounded-xl border border-app p-3">
              <div className="min-w-0">
                <div className="font-medium truncate">{it.product_name}</div>
                <div className="text-xs text-muted">
                  مباع: {it.quantity} · {formatMoney(it.unit_price, currency)}
                </div>
              </div>
              <Input
                type="number"
                min={0}
                max={Number(it.quantity)}
                className="w-24"
                value={qtyMap[it.id!] || 0}
                onChange={(e) =>
                  setQtyMap((m) => ({
                    ...m,
                    [it.id!]: Math.min(Number(it.quantity), Math.max(0, Number(e.target.value) || 0)),
                  }))
                }
              />
            </div>
          ))}
        </div>
        <div className="mt-3">
          <Input label="السبب" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
      </Dialog>
    </div>
  );
}
