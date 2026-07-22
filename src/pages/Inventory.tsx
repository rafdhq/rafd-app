import { useEffect, useState } from 'react';
import { AlertTriangle, PackageCheck, RefreshCw } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Tabs from '../components/ui/Tabs';
import { Table, THead, TH, TBody, TD } from '../components/ui/Table';
import { PageSkeleton } from '../components/ui/Skeleton';
import { ErrorState } from '../components/ui/States';
import EmptyState from '../components/ui/EmptyState';
import Dialog from '../components/ui/Dialog';
import Input from '../components/ui/Input';
import ProductThumb from '../components/products/ProductThumb';
import { useTenant } from '../contexts/TenantContext';
import type { Product } from '../lib/types';
import { formatMoney, unitCostFromCarton } from '../lib/utils';

export default function Inventory() {
  const { tenant } = useTenant();
  const currency = tenant?.currency || 'YER';
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('all');
  const [adjust, setAdjust] = useState<Product | null>(null);
  const [qty, setQty] = useState(0);
  const [addCartons, setAddCartons] = useState(0);
  const [cartonCost, setCartonCost] = useState(0);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!tenant?.id) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/products?tenant_id=${tenant.id}`);
      if (!res.ok) throw new Error('فشل التحميل');
      setItems(await res.json());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'خطأ');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [tenant?.id]);

  const low = items.filter((p) => Number(p.stock) <= Number(p.min_stock));
  const out = items.filter((p) => Number(p.stock) <= 0);
  const view = tab === 'low' ? low : tab === 'out' ? out : items;

  const saveAdjust = async () => {
    if (!adjust) return;
    setBusy(true);
    try {
      if (addCartons > 0) {
        await fetch('/api/products', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: adjust.id,
            add_cartons: addCartons,
            carton_cost: cartonCost || undefined,
            units_per_carton: adjust.units_per_carton || 1,
          }),
        });
      } else {
        await fetch('/api/products', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: adjust.id, stock: qty }),
        });
      }
      setAdjust(null);
      setAddCartons(0);
      load();
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <PageSkeleton />;
  if (error) return <ErrorState description={error} onRetry={load} />;

  const upc = Number(adjust?.units_per_carton || 1) || 1;

  return (
    <div>
      <PageHeader
        title="المخزون"
        description="التوريد بالكرتون · الجرد بالحبة · سعر شراء الحبة تلقائي"
        actions={
          <Button variant="outline" onClick={load}>
            <RefreshCw className="h-4 w-4" />
            تحديث
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-app bg-surface p-4 shadow-soft">
          <div className="text-sm text-muted">إجمالي الأصناف</div>
          <div className="mt-1 text-2xl font-bold">{items.length}</div>
        </div>
        <div className="rounded-2xl border border-app bg-warning-soft/40 p-4">
          <div className="flex items-center gap-2 text-sm text-warning">
            <AlertTriangle className="h-4 w-4" /> تحت الحد الأدنى
          </div>
          <div className="mt-1 text-2xl font-bold text-app">{low.length}</div>
        </div>
        <div className="rounded-2xl border border-app bg-danger-soft/40 p-4">
          <div className="text-sm text-danger">نفد المخزون</div>
          <div className="mt-1 text-2xl font-bold">{out.length}</div>
        </div>
      </div>

      <div className="mb-4">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'all', label: 'الكل', count: items.length },
            { id: 'low', label: 'منخفض', count: low.length },
            { id: 'out', label: 'نفد', count: out.length },
          ]}
        />
      </div>

      {!view.length ? (
        <EmptyState icon={PackageCheck} title="لا توجد عناصر" description="المخزون ضمن الحدود الآمنة" />
      ) : (
        <Table>
          <THead>
            <TH>المنتج</TH>
            <TH>المتاح (حبة)</TH>
            <TH>بالكرتون</TH>
            <TH>شراء/حبة</TH>
            <TH>قيمة المخزون</TH>
            <TH>الحالة</TH>
            <TH></TH>
          </THead>
          <TBody>
            {view.map((p) => {
              const status =
                Number(p.stock) <= 0 ? 'out' : Number(p.stock) <= Number(p.min_stock) ? 'low' : 'ok';
              const units = Number(p.units_per_carton || 1) || 1;
              const cartons = Math.floor(Number(p.stock) / units);
              return (
                <tr key={p.id}>
                  <TD>
                    <div className="flex items-center gap-3">
                      <ProductThumb product={p} size="md" />
                      <div>
                        <div className="font-medium">{p.name_ar || p.name}</div>
                        <div className="text-xs text-muted">
                          {p.category} · {units} حبة/كرتون
                        </div>
                      </div>
                    </div>
                  </TD>
                  <TD className="tabular font-semibold">{p.stock}</TD>
                  <TD className="tabular">~{cartons}</TD>
                  <TD className="tabular text-muted">{formatMoney(p.cost, currency)}</TD>
                  <TD className="tabular">
                    {formatMoney(Number(p.stock) * Number(p.cost), currency)}
                  </TD>
                  <TD>
                    <Badge tone={status === 'ok' ? 'success' : status === 'low' ? 'warning' : 'danger'}>
                      {status === 'ok' ? 'جيد' : status === 'low' ? 'منخفض' : 'نفد'}
                    </Badge>
                  </TD>
                  <TD>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setAdjust(p);
                        setQty(Number(p.stock));
                        setAddCartons(0);
                        setCartonCost(Number(p.carton_cost || Number(p.cost) * units));
                      }}
                    >
                      توريد/تسوية
                    </Button>
                  </TD>
                </tr>
              );
            })}
          </TBody>
        </Table>
      )}

      <Dialog
        open={!!adjust}
        onClose={() => setAdjust(null)}
        title={`مخزون — ${adjust?.name_ar || ''}`}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAdjust(null)}>
              إلغاء
            </Button>
            <Button loading={busy} onClick={saveAdjust}>
              حفظ
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="rounded-2xl border border-primary/20 bg-primary-soft/30 p-4">
            <div className="mb-3 text-sm font-semibold text-primary">توريد بالكرتون</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="عدد الكراتين المضافة"
                type="number"
                min={0}
                value={addCartons}
                onChange={(e) => setAddCartons(Number(e.target.value) || 0)}
              />
              <Input
                label="سعر شراء الكرتون"
                type="number"
                value={cartonCost}
                onChange={(e) => setCartonCost(Number(e.target.value) || 0)}
              />
            </div>
            <div className="mt-3 grid gap-2 text-xs text-muted sm:grid-cols-2">
              <div>
                سيُضاف: {addCartons * upc} حبة ({upc} حبة/كرتون)
              </div>
              <div>
                سعر الشراء بالحبة تلقائياً:{' '}
                <strong className="text-app">
                  {formatMoney(unitCostFromCarton(cartonCost, upc), currency)}
                </strong>
              </div>
            </div>
          </div>
          <Input
            label="أو ضبط الكمية بالحبة مباشرة"
            type="number"
            value={qty}
            onChange={(e) => setQty(Number(e.target.value))}
            hint="يُستخدم فقط إذا كان عدد الكراتين = 0"
          />
        </div>
      </Dialog>
    </div>
  );
}
