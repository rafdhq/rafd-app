import { useEffect, useMemo, useState } from 'react';
import { MessageCircle, Plus, Trash2, PackagePlus, CheckCircle2, Eye, Printer, FileText } from 'lucide-react';
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
import PurchaseOrderDoc from '../components/purchases/PurchaseOrderDoc';
import type { PurchaseOrderViewModel } from '../components/purchases/PurchaseOrderDoc';
import { formatDate, formatMoney, sanitizeFileName, shareWhatsApp } from '../lib/utils';

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
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [receiving, setReceiving] = useState<Purchase | null>(null);
  const [receiveItems, setReceiveItems] = useState<
    Array<{
      id?: number;
      product_id?: number | null;
      product_name: string;
      quantity: number;
      received_quantity: number;
      unit_cost: number;
      unit?: string;
      total: number;
    }>
  >([]);
  const [receivePaid, setReceivePaid] = useState(0);
  const [receiveDocOpen, setReceiveDocOpen] = useState(false);
  const [receivedView, setReceivedView] = useState<Purchase | null>(null);
  const [shareConfirmOpen, setShareConfirmOpen] = useState(false);
  const [createdPurchase, setCreatedPurchase] = useState<Purchase | null>(null);
  const [createdSupplier, setCreatedSupplier] = useState<Supplier | null>(null);

  const load = async () => {
    if (!tenant?.id) { setLoading(false); return; }
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
    // offer whatsapp share via styled dialog instead of native confirm
    if (supplier?.phone) {
      setCreatedPurchase(created);
      setCreatedSupplier(supplier);
      setShareConfirmOpen(true);
    }
  };

  const buildOrderWhatsAppText = (purchase: Purchase) => {
    const s = suppliers.find((x) => x.id === purchase.supplier_id);
    const itemLines = (purchase.items || []).map(
      (it, i) =>
        `${i + 1}) ${it.product_name} — ${it.cartons || ''} كرتون / ${it.quantity} ${it.unit || 'حبة'} × ${formatMoney(it.unit_cost, currency)} = ${formatMoney(it.total, currency)}`
    );
    return [
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
  };

  const shareOrder = (purchase: Purchase, supplier?: Supplier | null) => {
    const text = buildOrderWhatsAppText(purchase);
    const s = supplier || suppliers.find((x) => x.id === purchase.supplier_id);
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

  const openReceive = (p: Purchase) => {
    setReceiving(p);
    setReceiveItems(
      (p.items || []).map((it) => ({
        id: it.id,
        product_id: it.product_id,
        product_name: it.product_name,
        quantity: Number(it.quantity || 0),
        received_quantity: Number((it as { received_quantity?: number }).received_quantity ?? it.quantity ?? 0),
        unit_cost: Number(it.unit_cost || 0),
        unit: it.unit || 'حبة',
        total: Number(it.total || 0),
      }))
    );
    setReceivePaid(Number(p.paid || 0));
    setReceiveOpen(true);
  };

  const receiveTotal = useMemo(() => {
    return receiveItems.reduce((a, it) => a + it.received_quantity * it.unit_cost, 0);
  }, [receiveItems]);

  const receiveBalance = useMemo(() => {
    return receiveTotal - receivePaid;
  }, [receiveTotal, receivePaid]);

  const submitReceive = async () => {
    if (!receiving) return;
    setBusy(true);
    const res = await fetch('/api/purchases', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: receiving.id,
        receive: true,
        paid: receivePaid,
        items: receiveItems.map((it) => ({
          product_id: it.product_id,
          product_name: it.product_name,
          received_quantity: it.received_quantity,
          quantity: it.quantity,
          unit_cost: it.unit_cost,
          unit: it.unit,
          total: it.total,
        })),
      }),
    });
    setBusy(false);
    setReceiveOpen(false);
    if (res.ok) {
      const updated: Purchase = await res.json();
      setReceivedView(updated);
      setReceiveDocOpen(true);
      load();
    } else {
      alert('تعذر تأكيد الاستلام');
    }
  };

  const purchaseToViewModel = (p: Purchase): PurchaseOrderViewModel => {
    return {
      reference: p.reference,
      supplier_name: p.supplier_name,
      purchase_date: p.purchase_date,
      status: p.status,
      notes: p.notes,
      total: Number(p.total || 0),
      paid: Number(p.paid || 0),
      items: (p.items || []).map((it) => ({
        product_name: it.product_name,
        quantity: Number(it.quantity || 0),
        received_quantity: Number((it as { received_quantity?: number }).received_quantity ?? it.quantity ?? 0),
        unit: it.unit || 'حبة',
        unit_cost: Number(it.unit_cost || 0),
        total: Number(it.total || 0),
        cartons: Number(it.cartons || 0),
        units_per_carton: Number(it.units_per_carton || 1),
      })),
    };
  };

  const buildPurchaseBaseName = (p: Purchase) => {
    const t = sanitizeFileName(tenant?.name_ar || tenant?.name || 'رفد');
    const s = sanitizeFileName(p.supplier_name || 'مورد');
    const dateStr = new Date().toISOString().slice(0, 10);
    return `rafd-${t}-${s}-${p.reference}-${dateStr}`;
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
                      <Button size="sm" variant="primary" loading={busy} onClick={() => openReceive(p)}>
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
            <div className="flex flex-wrap gap-2">
              <Button
                variant="soft"
                onClick={() =>
                  viewing && shareOrder(viewing, suppliers.find((s) => s.id === viewing.supplier_id))
                }
              >
                <MessageCircle className="h-4 w-4" />
                واتساب نصي
              </Button>
              <Button
                variant="outline"
                onClick={async () => {
                  if (!viewing) return;
                  const { printElement } = await import('../lib/documentExport');
                  const el = document.getElementById('purchase-order-print');
                  if (el) await printElement(el);
                }}
              >
                <Printer className="h-4 w-4" />
                طباعة
              </Button>
              <Button
                variant="outline"
                onClick={async () => {
                  if (!viewing) return;
                  const { downloadElementAsPdf } = await import('../lib/documentExport');
                  const el = document.getElementById('purchase-order-print');
                  if (el) await downloadElementAsPdf(el, `${buildPurchaseBaseName(viewing)}.pdf`);
                }}
              >
                <FileText className="h-4 w-4" />
                PDF
              </Button>
              <Button
                variant="outline"
                onClick={async () => {
                  if (!viewing) return;
                  const { shareDocumentBundle } = await import('../lib/documentExport');
                  const el = document.getElementById('purchase-order-print');
                  if (!el) return;
                  const text = buildOrderWhatsAppText(viewing);
                  await shareDocumentBundle({
                    element: el,
                    phone: suppliers.find((s) => s.id === viewing.supplier_id)?.phone,
                    text,
                    baseName: buildPurchaseBaseName(viewing),
                    mode: 'whatsapp-both',
                  });
                }}
              >
                <MessageCircle className="h-4 w-4" />
                واتساب صورة
              </Button>
            </div>
            <div className="flex gap-2">
              {viewing && viewing.status !== 'received' && (
                <Button loading={busy} onClick={() => viewing && openReceive(viewing)}>
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
            <PurchaseOrderDoc
              tenant={tenant}
              order={purchaseToViewModel(viewing)}
              currency={currency}
              docId="purchase-order-print"
              mode="order"
            />
          </div>
        )}
      </Dialog>
      {/* Receive order dialog */}
      <Dialog
        open={receiveOpen}
        onClose={() => setReceiveOpen(false)}
        title={`استلام طلبية ${receiving?.reference || ''}`}
        description={receiving?.supplier_name || ''}
        size="lg"
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm text-muted">
              المتبقي:{" "}
              <span
                className={`text-lg font-bold tabular ${receiveBalance > 0 ? 'text-warning' : receiveBalance < 0 ? 'text-success' : 'text-primary'}`}
              >
                {formatMoney(Math.abs(receiveBalance), currency)}
                {receiveBalance > 0 ? ' (له)' : receiveBalance < 0 ? ' (علينا)' : ''}
              </span>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setReceiveOpen(false)}>
                إلغاء
              </Button>
              <Button loading={busy} onClick={submitReceive}>
                تأكيد الاستلام
              </Button>
            </div>
          </div>
        }
      >
        {receiving && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="المبلغ المدفوع للمورد"
                type="number"
                min={0}
                value={receivePaid}
                onChange={(e) => setReceivePaid(Number(e.target.value) || 0)}
              />
              <div className="flex items-end">
                <div className="rounded-xl bg-muted px-3 py-2 text-sm">
                  إجمالي المستلم:{' '}
                  <strong className="tabular">{formatMoney(receiveTotal, currency)}</strong>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              {receiveItems.map((it, idx) => (
                <div
                  key={idx}
                  className="grid gap-2 rounded-xl border border-app bg-surface p-3 sm:grid-cols-12 sm:items-end"
                >
                  <div className="sm:col-span-4">
                    <div className="text-xs text-muted">الصنف</div>
                    <div className="font-medium">{it.product_name}</div>
                  </div>
                  <div className="sm:col-span-2">
                    <div className="text-xs text-muted">المطلوب</div>
                    <div className="tabular">
                      {it.quantity} {it.unit}
                    </div>
                  </div>
                  <div className="sm:col-span-3">
                    <Input
                      label="المستلم"
                      type="number"
                      min={0}
                      value={it.received_quantity}
                      onChange={(e) => {
                        const val = Number(e.target.value) || 0;
                        setReceiveItems((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, received_quantity: val } : item))
                        );
                      }}
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <Input
                      label="سعر الوحدة"
                      type="number"
                      min={0}
                      value={it.unit_cost}
                      onChange={(e) => {
                        const val = Number(e.target.value) || 0;
                        setReceiveItems((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, unit_cost: val } : item))
                        );
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Dialog>

      {/* Share confirmation after create */}
      <Dialog
        open={shareConfirmOpen}
        onClose={() => setShareConfirmOpen(false)}
        title="مشاركة الطلبية"
        description={`هل تريد إرسال طلبية ${createdPurchase?.reference || ''} عبر واتساب للمورد ${createdSupplier?.name || ''}؟`}
        size="sm"
        footer={
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setShareConfirmOpen(false)}>
              لاحقاً
            </Button>
            <Button
              onClick={() => {
                setShareConfirmOpen(false);
                if (createdPurchase) shareOrder(createdPurchase, createdSupplier);
              }}
            >
              <MessageCircle className="h-4 w-4" />
              مشاركة
            </Button>
          </div>
        }
      >
        <div className="text-sm text-muted">
          سيتم فتح واتساب مع نص الطلبية جاهزاً للإرسال.
        </div>
      </Dialog>

      {/* Received receipt dialog */}
      <Dialog
        open={receiveDocOpen}
        onClose={() => {
          setReceiveDocOpen(false);
          setReceivedView(null);
        }}
        title={`إيصال استلام — ${receivedView?.reference || ''}`}
        description={receivedView?.supplier_name || ''}
        size="lg"
        footer={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={async () => {
                if (!receivedView) return;
                const { printElement } = await import('../lib/documentExport');
                const el = document.getElementById('purchase-receipt-print');
                if (el) await printElement(el);
              }}
            >
              <Printer className="h-4 w-4" />
              طباعة
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                if (!receivedView) return;
                const { downloadElementAsPdf } = await import('../lib/documentExport');
                const el = document.getElementById('purchase-receipt-print');
                if (el) await downloadElementAsPdf(el, `${buildPurchaseBaseName(receivedView)}-receipt.pdf`);
              }}
            >
              <FileText className="h-4 w-4" />
              PDF
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                if (!receivedView) return;
                const { shareDocumentBundle } = await import('../lib/documentExport');
                const el = document.getElementById('purchase-receipt-print');
                if (!el) return;
                const text = buildOrderWhatsAppText(receivedView);
                await shareDocumentBundle({
                  element: el,
                  phone: suppliers.find((s) => s.id === receivedView.supplier_id)?.phone,
                  text,
                  baseName: `${buildPurchaseBaseName(receivedView)}-receipt`,
                  mode: 'whatsapp-both',
                });
              }}
            >
              <MessageCircle className="h-4 w-4" />
              واتساب
            </Button>
            <Button
              onClick={() => {
                setReceiveDocOpen(false);
                setReceivedView(null);
              }}
            >
              تم
            </Button>
          </div>
        }
      >
        {receivedView && (
          <PurchaseOrderDoc
            tenant={tenant}
            order={purchaseToViewModel(receivedView)}
            currency={currency}
            docId="purchase-receipt-print"
            mode="receipt"
          />
        )}
      </Dialog>
    </div>
  );
}
