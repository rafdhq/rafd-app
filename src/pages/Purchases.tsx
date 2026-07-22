import { useEffect, useMemo, useState } from 'react';
import { MessageCircle, Plus, Trash2, PackagePlus, CheckCircle2, Eye } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Dialog from '../components/ui/Dialog';
import Badge from '../components/ui/Badge';
import { Table, THead, TH, TBody, TD } from '../components/ui/Table';
import { PageSkeleton } from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import { useTenant } from '../contexts/TenantContext';
import type { Product, Purchase, PurchaseItem, Supplier } from '../lib/types';
import { formatDate, formatMoney, shareWhatsApp } from '../lib/utils';

interface DraftLine {
  key: string;
  product_id: number | '';
  product_name: string;
  cartons: number;
  units_per_carton: number;
  unit_cost: number; // per piece
  unit: string;
}

function lineQty(l: DraftLine) {
  return Number(l.cartons || 0) * Number(l.units_per_carton || 1);
}

function lineTotal(l: DraftLine) {
  return lineQty(l) * Number(l.unit_cost || 0);
}

function statusLabel(s: string) {
  if (s === 'received') return 'مستلم';
  if (s === 'pending' || s === 'ordered') return 'طلبية';
  if (s === 'cancelled') return 'ملغي';
  return s;
}

function statusTone(s: string): 'success' | 'warning' | 'default' | 'danger' {
  if (s === 'received') return 'success';
  if (s === 'pending' || s === 'ordered') return 'warning';
  if (s === 'cancelled') return 'danger';
  return 'default';
}

export default function Purchases() {
  const { tenant } = useTenant();
  const currency = tenant?.currency || 'YER';
  const [items, setItems] = useState<Purchase[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [viewing, setViewing] = useState<Purchase | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    supplier_id: '',
    reference: `PO-${Date.now().toString().slice(-6)}`,
    paid: 0,
    status: 'pending',
    purchase_date: new Date().toISOString().slice(0, 10),
    notes: '',
  });
  const [lines, setLines] = useState<DraftLine[]>([]);

  const load = async () => {
    if (!tenant?.id) return;
    setLoading(true);
    const [pRes, sRes, prRes] = await Promise.all([
      fetch(`/api/purchases?tenant_id=${tenant.id}`),
      fetch(`/api/suppliers?tenant_id=${tenant.id}`),
      fetch(`/api/products?tenant_id=${tenant.id}`),
    ]);
    if (pRes.ok) setItems(await pRes.json());
    if (sRes.ok) setSuppliers(await sRes.json());
    if (prRes.ok) setProducts(await prRes.json());
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [tenant?.id]);

  const supplierProducts = useMemo(() => {
    if (!form.supplier_id) return products;
    const sid = Number(form.supplier_id);
    const linked = products.filter((p) => Number(p.supplier_id) === sid);
    return linked.length ? linked : products;
  }, [products, form.supplier_id]);

  const orderTotal = useMemo(() => lines.reduce((a, l) => a + lineTotal(l), 0), [lines]);

  const openCreate = () => {
    setForm({
      supplier_id: suppliers[0]?.id ? String(suppliers[0].id) : '',
      reference: `PO-${Date.now().toString().slice(-6)}`,
      paid: 0,
      status: 'pending',
      purchase_date: new Date().toISOString().slice(0, 10),
      notes: '',
    });
    setLines([]);
    setOpen(true);
  };

  const addLineFromProduct = (productId: number) => {
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    const upc = Number(p.units_per_carton || 1) || 1;
    setLines((prev) => {
      if (prev.some((l) => l.product_id === productId)) return prev;
      return [
        ...prev,
        {
          key: `${productId}-${Date.now()}`,
          product_id: productId,
          product_name: p.name_ar || p.name,
          cartons: 1,
          units_per_carton: upc,
          unit_cost: Number(p.cost || 0),
          unit: p.unit || 'حبة',
        },
      ];
    });
  };

  const addEmptyLine = () => {
    setLines((prev) => [
      ...prev,
      {
        key: `new-${Date.now()}`,
        product_id: '',
        product_name: '',
        cartons: 1,
        units_per_carton: 12,
        unit_cost: 0,
        unit: 'حبة',
      },
    ]);
  };

  const updateLine = (key: string, patch: Partial<DraftLine>) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const next = { ...l, ...patch };
        if (patch.product_id) {
          const p = products.find((x) => x.id === Number(patch.product_id));
          if (p) {
            next.product_name = p.name_ar || p.name;
            next.units_per_carton = Number(p.units_per_carton || next.units_per_carton || 1);
            next.unit_cost = Number(p.cost || next.unit_cost || 0);
            next.unit = p.unit || 'حبة';
          }
        }
        return next;
      })
    );
  };

  const removeLine = (key: string) => setLines((prev) => prev.filter((l) => l.key !== key));

  const buildItemsPayload = (): PurchaseItem[] =>
    lines
      .filter((l) => l.product_name && lineQty(l) > 0)
      .map((l) => ({
        product_id: l.product_id ? Number(l.product_id) : null,
        product_name: l.product_name,
        quantity: lineQty(l),
        unit: l.unit,
        unit_cost: Number(l.unit_cost || 0),
        total: lineTotal(l),
        units_per_carton: Number(l.units_per_carton || 1),
        cartons: Number(l.cartons || 0),
      }));

  const save = async () => {
    if (!form.supplier_id) {
      alert('اختر المورد');
      return;
    }
    const payloadItems = buildItemsPayload();
    if (!payloadItems.length) {
      alert('أضف أصنافاً للطلبية');
      return;
    }
    setBusy(true);
    const supplier = suppliers.find((s) => String(s.id) === String(form.supplier_id));
    const res = await fetch('/api/purchases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenant_id: tenant?.id,
        supplier_id: Number(form.supplier_id),
        supplier_name: supplier?.name || null,
        reference: form.reference,
        paid: form.paid,
        status: form.status,
        purchase_date: form.purchase_date,
        notes: form.notes,
        total: orderTotal,
        items: payloadItems,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      alert('تعذر حفظ الطلبية');
      return;
    }
    const created: Purchase = await res.json();
    setOpen(false);
    load();
    // offer whatsapp share
    if (supplier?.phone && confirm('مشاركة الطلبية عبر واتساب مع المورد؟')) {
      shareOrder(created, supplier);
    }
  };

  const shareOrder = (purchase: Purchase, supplier?: Supplier | null) => {
    const s = supplier || suppliers.find((x) => x.id === purchase.supplier_id);
    const itemLines = (purchase.items || []).map(
      (it, i) =>
        `${i + 1}) ${it.product_name} — ${it.cartons || ''} كرتون / ${it.quantity} ${it.unit || 'حبة'} × ${formatMoney(it.unit_cost, currency)} = ${formatMoney(it.total, currency)}`
    );
    const text = [
      `طلبية شراء — ${tenant?.name_ar || tenant?.name || 'المتجر'}`,
      `المرجع: ${purchase.reference}`,
      `التاريخ: ${purchase.purchase_date}`,
      `المورد: ${purchase.supplier_name || s?.name || ''}`,
      '────────',
      ...itemLines,
      '────────',
      `الإجمالي: ${formatMoney(purchase.total, currency)}`,
      purchase.paid ? `المدفوع: ${formatMoney(purchase.paid, currency)}` : '',
      `الحالة: ${statusLabel(purchase.status)}`,
      purchase.notes ? `ملاحظات: ${purchase.notes}` : '',
      '',
      'مرسلة من رفد | RAFD',
    ]
      .filter(Boolean)
      .join('\n');
    shareWhatsApp(s?.phone || '', text);
  };

  const openView = async (p: Purchase) => {
    const res = await fetch(`/api/purchases?id=${p.id}&tenant_id=${tenant?.id}`);
    if (res.ok) {
      const full = await res.json();
      setViewing(full);
    } else {
      setViewing(p);
    }
    setViewOpen(true);
  };

  const receiveOrder = async (p: Purchase) => {
    if (!confirm('تأكيد استلام الطلبية وتحديث المخزون؟')) return;
    setBusy(true);
    await fetch('/api/purchases', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: p.id, receive: true }),
    });
    setBusy(false);
    setViewOpen(false);
    load();
  };

  if (loading) return <PageSkeleton />;

  return (
    <div>
      <PageHeader
        title="الطلبيات والمشتريات"
        description="إنشاء طلبية للمورد · مشاركة واتساب · استلام للمخزون"
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> طلبية جديدة
          </Button>
        }
      />

      {!items.length ? (
        <EmptyState
          title="لا توجد طلبيات"
          description="أنشئ أول طلبية واربطها بمورد ومنتجاته"
          actionLabel="طلبية جديدة"
          onAction={openCreate}
        />
      ) : (
        <Table>
          <THead>
            <TH>المرجع</TH>
            <TH>المورد</TH>
            <TH>التاريخ</TH>
            <TH>الأصناف</TH>
            <TH>الإجمالي</TH>
            <TH>المدفوع</TH>
            <TH>الحالة</TH>
            <TH></TH>
          </THead>
          <TBody>
            {items.map((p) => (
              <tr key={p.id}>
                <TD className="font-mono text-xs font-semibold">{p.reference}</TD>
                <TD>{p.supplier_name || '—'}</TD>
                <TD>{formatDate(p.purchase_date)}</TD>
                <TD>{p.items?.length || '—'}</TD>
                <TD className="tabular font-semibold">{formatMoney(p.total, currency)}</TD>
                <TD className="tabular">{formatMoney(p.paid, currency)}</TD>
                <TD>
                  <Badge tone={statusTone(p.status)}>{statusLabel(p.status)}</Badge>
                </TD>
                <TD>
                  <div className="flex flex-wrap gap-1">
                    <Button size="sm" variant="outline" onClick={() => openView(p)}>
                      <Eye className="h-3.5 w-3.5" />
                      عرض
                    </Button>
                    <Button
                      size="sm"
                      variant="soft"
                      onClick={() => shareOrder(p, suppliers.find((s) => s.id === p.supplier_id))}
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      واتساب
                    </Button>
                    {p.status !== 'received' && (
                      <Button size="sm" variant="primary" loading={busy} onClick={() => receiveOrder(p)}>
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        استلام
                      </Button>
                    )}
                  </div>
                </TD>
              </tr>
            ))}
          </TBody>
        </Table>
      )}

      {/* Create order */}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="طلبية شراء جديدة"
        size="xl"
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm text-muted">
              الإجمالي:{' '}
              <span className="text-lg font-bold tabular text-primary">{formatMoney(orderTotal, currency)}</span>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                إلغاء
              </Button>
              <Button loading={busy} onClick={save}>
                حفظ الطلبية
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Select
              label="المورد"
              value={form.supplier_id}
              onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}
              placeholder="اختر مورداً"
              options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
            />
            <Input
              label="المرجع"
              value={form.reference}
              onChange={(e) => setForm({ ...form, reference: e.target.value })}
            />
            <Input
              label="التاريخ"
              type="date"
              value={form.purchase_date}
              onChange={(e) => setForm({ ...form, purchase_date: e.target.value })}
            />
            <Select
              label="الحالة"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              options={[
                { value: 'pending', label: 'طلبية (معلقة)' },
                { value: 'received', label: 'مستلم الآن + مخزون' },
              ]}
            />
            <Input
              label="مدفوع الآن"
              type="number"
              value={form.paid}
              onChange={(e) => setForm({ ...form, paid: Number(e.target.value) || 0 })}
            />
            <Input
              label="ملاحظات"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>

          <div className="rounded-2xl border border-app bg-subtle p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="font-semibold text-app">أصناف الطلبية</div>
              <div className="flex flex-wrap gap-2">
                <Select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) addLineFromProduct(Number(e.target.value));
                  }}
                  placeholder="إضافة من منتجات المورد"
                  options={supplierProducts.map((p) => ({
                    value: p.id,
                    label: p.name_ar || p.name,
                  }))}
                />
                <Button size="sm" variant="outline" onClick={addEmptyLine}>
                  <PackagePlus className="h-4 w-4" />
                  سطر يدوي
                </Button>
              </div>
            </div>

            {!lines.length ? (
              <div className="py-6 text-center text-sm text-muted">
                اختر منتجات مرتبطة بالمورد أو أضف سطراً يدوياً
              </div>
            ) : (
              <div className="space-y-2">
                {lines.map((l) => (
                  <div
                    key={l.key}
                    className="grid gap-2 rounded-xl border border-app bg-surface p-3 sm:grid-cols-12 sm:items-end"
                  >
                    <div className="sm:col-span-4">
                      <Select
                        label="المنتج"
                        value={l.product_id}
                        onChange={(e) =>
                          updateLine(l.key, {
                            product_id: e.target.value ? Number(e.target.value) : '',
                          })
                        }
                        placeholder="اختر"
                        options={supplierProducts.map((p) => ({
                          value: p.id,
                          label: p.name_ar || p.name,
                        }))}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Input
                        label="كراتين"
                        type="number"
                        min={0}
                        value={l.cartons}
                        onChange={(e) => updateLine(l.key, { cartons: Number(e.target.value) || 0 })}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Input
                        label="حبة/كرتون"
                        type="number"
                        min={1}
                        value={l.units_per_carton}
                        onChange={(e) =>
                          updateLine(l.key, { units_per_carton: Number(e.target.value) || 1 })
                        }
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Input
                        label="تكلفة الحبة"
                        type="number"
                        value={l.unit_cost}
                        onChange={(e) => updateLine(l.key, { unit_cost: Number(e.target.value) || 0 })}
                      />
                    </div>
                    <div className="sm:col-span-1">
                      <div className="text-xs text-muted">الإجمالي</div>
                      <div className="font-bold tabular text-sm">{formatMoney(lineTotal(l), currency)}</div>
                      <div className="text-[10px] text-muted">{lineQty(l)} حبة</div>
                    </div>
                    <div className="sm:col-span-1 flex justify-end">
                      <Button variant="ghost" size="icon" onClick={() => removeLine(l.key)}>
                        <Trash2 className="h-4 w-4 text-danger" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Dialog>

      {/* View order */}
      <Dialog
        open={viewOpen}
        onClose={() => setViewOpen(false)}
        title={`طلبية ${viewing?.reference || ''}`}
        description={viewing?.supplier_name || ''}
        size="lg"
        footer={
          <div className="flex flex-wrap justify-between gap-2">
            <Button
              variant="soft"
              onClick={() =>
                viewing && shareOrder(viewing, suppliers.find((s) => s.id === viewing.supplier_id))
              }
            >
              <MessageCircle className="h-4 w-4" />
              مشاركة واتساب
            </Button>
            <div className="flex gap-2">
              {viewing && viewing.status !== 'received' && (
                <Button loading={busy} onClick={() => receiveOrder(viewing)}>
                  تأكيد الاستلام
                </Button>
              )}
              <Button variant="outline" onClick={() => setViewOpen(false)}>
                إغلاق
              </Button>
            </div>
          </div>
        }
      >
        {viewing && (
          <div className="space-y-4">
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                التاريخ: <strong>{formatDate(viewing.purchase_date)}</strong>
              </div>
              <div>
                الحالة: <Badge tone={statusTone(viewing.status)}>{statusLabel(viewing.status)}</Badge>
              </div>
              <div>
                الإجمالي: <strong className="tabular">{formatMoney(viewing.total, currency)}</strong>
              </div>
              <div>
                المدفوع: <strong className="tabular">{formatMoney(viewing.paid, currency)}</strong>
              </div>
            </div>
            <div className="space-y-2">
              {(viewing.items || []).map((it, idx) => (
                <div
                  key={it.id || idx}
                  className="flex items-center justify-between rounded-xl border border-app px-3 py-2 text-sm"
                >
                  <div>
                    <div className="font-medium">{it.product_name}</div>
                    <div className="text-xs text-muted">
                      {it.cartons ? `${it.cartons} كرتون · ` : ''}
                      {it.quantity} {it.unit || 'حبة'}
                    </div>
                  </div>
                  <div className="text-end tabular font-semibold">{formatMoney(it.total, currency)}</div>
                </div>
              ))}
              {!viewing.items?.length && <div className="text-sm text-muted">لا تفاصيل أصناف</div>}
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
