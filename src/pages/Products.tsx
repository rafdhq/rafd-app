import { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Pencil, Trash2, Package, Boxes } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Badge from '../components/ui/Badge';
import Dialog from '../components/ui/Dialog';
import { Table, THead, TH, TBody, TD } from '../components/ui/Table';
import EmptyState from '../components/ui/EmptyState';
import { PageSkeleton } from '../components/ui/Skeleton';
import { ErrorState, NoTenantState, PermissionErrorState, NetworkErrorState, OfflineBanner } from '../components/ui/States';
import BarcodeScanner from '../components/ui/BarcodeScanner';
import ProductThumb from '../components/products/ProductThumb';
import ProductImagePicker from '../components/products/ProductImagePicker';
import { useTenant } from '../contexts/TenantContext';
import { useTenantScopedList } from '../hooks/useTenantScopedList';
import { createProductWithOffline, updateProductWithOffline, deleteProductWithOffline } from '../lib/offline/productsQueue';
import { apiFetch } from '../lib/apiClient';
import type { Product, Supplier } from '../lib/types';
import { formatMoney, isWeightProduct, unitCostFromCarton } from '../lib/utils';
import { playSuccessChime } from '../lib/audioService';
import {
  categorySelectOptions,
  getCategoryMeta,
  isWeightCategory,
  resolveTenantCategories,
} from '../lib/catalog';
import { categoryIconSrc, isPresetIconUrl, isRealImageUrl } from '../lib/productMedia';

const emptyForm = {
  name: '',
  name_ar: '',
  sku: '',
  barcode: '',
  category: 'بقالة',
  price: 0,
  cartons: 1,
  units_per_carton: 12,
  carton_cost: 0,
  min_stock: 12,
  unit: 'حبة',
  image_url: '',
  is_active: true,
  sell_by_weight: false,
  supplier_id: '' as string | number,
};

export default function Products() {
  const { tenant } = useTenant();
  const currency = tenant?.currency || 'YER';
  const tenantCategories = useMemo(() => resolveTenantCategories(tenant), [tenant]);
  const categoryOptions = useMemo(
    () => categorySelectOptions(tenantCategories, { includeAllMaster: false }),
    [tenantCategories]
  );
  const [showAllCategories, setShowAllCategories] = useState(false);
  const effectiveCategoryOptions = useMemo(
    () =>
      showAllCategories
        ? categorySelectOptions(tenantCategories, { includeAllMaster: true })
        : categoryOptions,
    [showAllCategories, tenantCategories, categoryOptions]
  );
  const tenantId = tenant?.id ?? null;
  const {
    items,
    setItems,
    status,
    errorKind,
    errorMessage,
    offlineServed,
    reload: load,
  } = useTenantScopedList<Product>(
    'products',
    tenantId,
    tenantId != null ? `/api/products?tenant_id=${tenantId}` : null
  );
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [restockOpen, setRestockOpen] = useState(false);
  const [restockProduct, setRestockProduct] = useState<Product | null>(null);
  const [restockCartons, setRestockCartons] = useState(1);
  const [restockCartonCost, setRestockCartonCost] = useState(0);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState('');

  const isWeightCat = isWeightCategory(form.category) || form.sell_by_weight || isWeightProduct({ category: form.category, unit: form.unit, sell_by_weight: form.sell_by_weight });
  const unitCost = isWeightCat
    ? Number(form.carton_cost || 0)
    : unitCostFromCarton(form.carton_cost, form.units_per_carton);
  const stockPieces = isWeightCat
    ? Number(form.cartons || 0)
    : Number(form.cartons || 0) * Number(form.units_per_carton || 0);

  // Suppliers are a secondary lookup for the product form (dropdown) — a
  // failure here must not block the products page itself, so it is kept
  // separate from the primary useTenantScopedList status machine.
  useEffect(() => {
    if (tenantId == null) return;
    let cancelled = false;
    apiFetch<Supplier[]>(`/api/suppliers?tenant_id=${tenantId}`, { tenantId })
      .then((data) => {
        if (!cancelled) setSuppliers(data);
      })
      .catch(() => {
        /* non-fatal — supplier dropdown just stays empty */
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const filtered = useMemo(() => {
    if (!q) return items;
    const s = q.toLowerCase();
    return items.filter(
      (p) =>
        p.name_ar?.includes(q) ||
        p.name?.toLowerCase().includes(s) ||
        p.barcode?.includes(q) ||
        p.sku?.toLowerCase().includes(s)
    );
  }, [items, q]);

  const openCreate = () => {
    setEditing(null);
    const defaultCat = tenantCategories[0] || 'عام';
    const meta = getCategoryMeta(defaultCat);
    const weight = !!meta?.byWeight;
    setForm({
      ...emptyForm,
      category: defaultCat,
      image_url: categoryIconSrc(defaultCat),
      unit: meta?.defaultUnit || (weight ? 'كجم' : 'حبة'),
      sell_by_weight: weight,
      units_per_carton: weight ? 1 : 12,
      sku: `SKU-${Date.now().toString().slice(-6)}`,
      barcode: '',
    });
    setShowAllCategories(false);
    setSaveError('');
    setOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    const upc = Number(p.units_per_carton || 1) || 1;
    setForm({
      name: p.name,
      name_ar: p.name_ar,
      sku: p.sku,
      barcode: p.barcode,
      category: p.category,
      price: Number(p.price),
      cartons: Math.max(1, Math.round(Number(p.stock) / upc) || 1),
      units_per_carton: upc,
      carton_cost: Number(p.carton_cost ?? Number(p.cost) * upc),
      min_stock: Number(p.min_stock),
      unit: p.unit || 'حبة',
      image_url: isRealImageUrl(p.image_url)
        ? p.image_url || categoryIconSrc(p.category)
        : isPresetIconUrl(p.image_url)
          ? p.image_url || categoryIconSrc(p.category)
          : categoryIconSrc(p.category),
      is_active: p.is_active,
      sell_by_weight: isWeightProduct(p),
      supplier_id: p.supplier_id || '',
    });
    setShowAllCategories(!tenantCategories.includes(p.category));
    setSaveError('');
    setOpen(true);
  };

  const save = async () => {
    if (!form.name_ar && !form.name) return;
    if (tenantId == null) return;
    setBusy(true);
    setSaveError('');
    try {
      const weightMode = isWeightCategory(form.category) || form.sell_by_weight;
      const upc = weightMode ? 1 : Number(form.units_per_carton || 1) || 1;
      const cartonCost = Number(form.carton_cost || 0);
      const payload = {
        name: form.name || form.name_ar,
        name_ar: form.name_ar || form.name,
        sku: form.sku,
        barcode: form.barcode,
        category: form.category,
        price: form.price,
        units_per_carton: upc,
        carton_cost: cartonCost,
        cartons: form.cartons,
        min_stock: form.min_stock,
        unit: weightMode ? 'كجم' : form.unit || 'حبة',
        image_url: form.image_url || categoryIconSrc(form.category),
        is_active: form.is_active,
        tenant_id: tenantId,
        supplier_id: form.supplier_id ? Number(form.supplier_id) : null,
      };

      if (editing) {
        const { product, offline } = await updateProductWithOffline(
          { id: editing.id, ...payload, stock: stockPieces },
          tenantId
        );
        if (product) {
          setItems((prev) => prev.map((p) => (p.id === editing.id ? { ...p, ...product } as Product : p)));
        }
        if (offline) setSaveError('');
      } else {
        const { product, offline } = await createProductWithOffline(payload, tenantId);
        setItems((prev) => [product as unknown as Product, ...prev]);
        if (offline) setSaveError('');
      }
      // Audible confirmation that the product was saved (uses shared Audio Service).
      playSuccessChime();
      setOpen(false);
    } catch (err) {
      // Genuine rejection (validation/permission/etc) — surface it, keep the
      // dialog open so the user can fix input instead of a silent no-op.
      setSaveError(err instanceof Error ? err.message : 'فشل الحفظ');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    if (tenantId == null) return;
    if (!confirm('حذف المنتج؟')) return;
    try {
      await deleteProductWithOffline(id, tenantId);
      setItems((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'تعذر حذف المنتج');
    }
  };

  const saveRestock = async () => {
    if (!restockProduct || tenantId == null) return;
    setBusy(true);
    try {
      const { product } = await updateProductWithOffline(
        {
          id: restockProduct.id,
          add_cartons: restockCartons,
          carton_cost: restockCartonCost,
          units_per_carton: restockProduct.units_per_carton || 1,
        },
        tenantId
      );
      if (product) {
        setItems((prev) => prev.map((p) => (p.id === restockProduct.id ? { ...p, ...product } as Product : p)));
      }
      setRestockOpen(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'تعذر التوريد');
    } finally {
      setBusy(false);
    }
  };

  if (status === 'loading') return <PageSkeleton />;
  if (status === 'no-tenant') return <NoTenantState onRetry={load} />;
  if (status === 'error') {
    if (errorKind === 'permission') return <PermissionErrorState description={errorMessage} />;
    if (errorKind === 'network') return <NetworkErrorState description={errorMessage} onRetry={load} />;
    return <ErrorState description={errorMessage} onRetry={load} />;
  }

  return (
    <div>
      {offlineServed && (
        <div className="mb-3">
          <OfflineBanner visible />
        </div>
      )}
      <PageHeader
        title="المنتجات"
        description="فئات حسب نشاط المتجر · كرتون/حبة أو وزن · باركود"
        breadcrumbs={
          tenant?.business_type
            ? `نشاط: ${tenant.business_type} · ${tenantCategories.length} فئة مفعّلة`
            : `${tenantCategories.length} فئة مفعّلة`
        }
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            منتج جديد
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            data-barcode-input="true"
            placeholder="بحث بالاسم أو الباركود..."
            className="h-11 w-full rounded-xl border border-app bg-surface pe-10 ps-3 text-sm shadow-soft focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
          />
        </div>
        <Badge tone="primary">{filtered.length} منتج</Badge>
      </div>

      {!filtered.length ? (
        <EmptyState
          icon={Package}
          title="لا توجد منتجات"
          description="أضف أول منتج بالكرتون لبدء البيع"
          actionLabel="إضافة منتج"
          onAction={openCreate}
        />
      ) : (
        <Table>
          <THead>
            <TH>المنتج</TH>
            <TH>المورد</TH>
            <TH>الباركود</TH>
            <TH>سعر البيع</TH>
            <TH>سعر الشراء</TH>
            <TH>التعبئة</TH>
            <TH>المخزون</TH>
            <TH>الحالة</TH>
            <TH></TH>
          </THead>
          <TBody>
            {filtered.map((p) => {
              const upc = Number(p.units_per_carton || 1) || 1;
              const cartons = Math.floor(Number(p.stock) / upc);
              return (
                <tr key={p.id} className="hover:bg-muted/40">
                  <TD>
                    <div className="flex items-center gap-3">
                      <ProductThumb product={p} size="md" />
                      <div>
                        <div className="font-medium">{p.name_ar || p.name}</div>
                        <div className="text-xs text-muted">
                          {p.category} · {p.sku}
                        </div>
                      </div>
                    </div>
                  </TD>
                  <TD className="text-sm text-secondary">{p.supplier_name || '—'}</TD>
                  <TD className="font-mono text-xs">{p.barcode}</TD>
                  <TD className="tabular font-semibold">
                    {formatMoney(p.price, currency)}
                    <div className="text-[10px] font-normal text-muted">
                      {isWeightProduct(p) ? 'لكل كجم' : 'للحبة'}
                    </div>
                  </TD>
                  <TD className="tabular text-muted">
                    {formatMoney(p.cost, currency)}
                    <div className="text-[10px]">{isWeightProduct(p) ? '/كجم' : '/حبة'}</div>
                  </TD>
                  <TD className="text-xs text-muted">
                    {isWeightProduct(p) ? (
                      <>
                        بيع بالوزن
                        <div>أدخل الغرام في نقطة البيع</div>
                      </>
                    ) : (
                      <>
                        {upc} حبة/كرتون
                        <div className="tabular">
                          {formatMoney(p.carton_cost || Number(p.cost) * upc, currency)}/كرتون
                        </div>
                      </>
                    )}
                  </TD>
                  <TD>
                    <Badge tone={Number(p.stock) <= Number(p.min_stock) ? 'warning' : 'success'}>
                      {isWeightProduct(p)
                        ? `${p.stock} كجم`
                        : `${p.stock} حبة · ~${cartons} كرتون`}
                    </Badge>
                  </TD>
                  <TD>
                    <Badge tone={p.is_active ? 'success' : 'default'}>
                      {p.is_active ? 'نشط' : 'موقوف'}
                    </Badge>
                  </TD>
                  <TD>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="توريد كراتين"
                        onClick={() => {
                          setRestockProduct(p);
                          setRestockCartons(1);
                          setRestockCartonCost(Number(p.carton_cost || Number(p.cost) * upc));
                          setRestockOpen(true);
                        }}
                      >
                        <Boxes className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(p)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => remove(p.id)}>
                        <Trash2 className="h-4 w-4 text-danger" />
                      </Button>
                    </div>
                  </TD>
                </tr>
              );
            })}
          </TBody>
        </Table>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'تعديل منتج' : 'منتج جديد (بالكرتون)'}
        size="lg"
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
        {saveError && (
          <div className="mb-4 rounded-xl border border-[var(--danger)]/30 bg-danger-soft px-3 py-2 text-sm text-danger">
            {saveError}
          </div>
        )}
        <div className="mb-4">
          <BarcodeScanner
            onScan={(code) => setForm((f) => ({ ...f, barcode: code }))}
            compact
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="الاسم بالعربي"
            value={form.name_ar}
            onChange={(e) => setForm({ ...form, name_ar: e.target.value })}
          />
          <Input label="Name EN" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="SKU" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
          <Input
            label="الباركود"
            value={form.barcode}
            onChange={(e) => setForm({ ...form, barcode: e.target.value })}
            data-barcode-input="true"
            hint="امسح بالقارئ أو الكاميرا"
          />
          <div className="sm:col-span-2 space-y-2">
            <Select
              label="التصنيف / الفئة"
              value={form.category}
              onChange={(e) => {
                const category = e.target.value;
                const meta = getCategoryMeta(category);
                const weight = !!meta?.byWeight;
                // If no custom photo uploaded, refresh category default icon
                const nextImage =
                  !form.image_url || isPresetIconUrl(form.image_url)
                    ? categoryIconSrc(category)
                    : form.image_url;
                setForm({
                  ...form,
                  category,
                  image_url: nextImage,
                  sell_by_weight: weight || form.sell_by_weight,
                  unit: weight ? meta?.defaultUnit || 'كجم' : meta?.defaultUnit || (form.unit === 'كجم' ? 'حبة' : form.unit),
                  units_per_carton: weight ? 1 : form.units_per_carton || 12,
                });
              }}
              options={effectiveCategoryOptions}
            />
            <label className="flex items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={showAllCategories}
                onChange={(e) => setShowAllCategories(e.target.checked)}
              />
              خيارات متقدمة: عرض كل فئات المنصة (بهارات، خردوات، أجهزة، مطاعم...)
            </label>
          </div>
          <Select
            label="المورد"
            value={form.supplier_id}
            onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}
            placeholder="بدون مورد"
            options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
          />
          <ProductImagePicker
            value={form.image_url}
            category={form.category}
            name={form.name_ar || form.name}
            tenantId={tenant?.id}
            onChange={(image_url) => setForm({ ...form, image_url })}
          />

          <div className="sm:col-span-2 rounded-2xl border border-primary/20 bg-primary-soft/30 p-4">
            <div className="mb-3 text-sm font-semibold text-primary">
              {isWeightCat
                ? 'تسعير بالوزن (السعر لكل كجم — البيع بالغرام في POS)'
                : 'التعبئة والتسعير (كرتون / حبة)'}
            </div>
            {isWeightCat && (
              <div className="mb-3 rounded-xl bg-accent-soft/50 px-3 py-2 text-xs text-secondary">
                عند البيع: أدخل الوزن بالجرام (مثال 750) ويُحسب المبلغ = (الغرام ÷ 1000) × سعر الكجم تلقائياً.
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {!isWeightCat && (
                <>
                  <Input
                    label="عدد الكراتين"
                    type="number"
                    min={0}
                    value={form.cartons}
                    onChange={(e) => setForm({ ...form, cartons: Number(e.target.value) })}
                  />
                  <Input
                    label="حبة في الكرتون"
                    type="number"
                    min={1}
                    value={form.units_per_carton}
                    onChange={(e) => setForm({ ...form, units_per_carton: Number(e.target.value) || 1 })}
                  />
                  <Input
                    label="سعر شراء الكرتون"
                    type="number"
                    min={0}
                    value={form.carton_cost}
                    onChange={(e) => setForm({ ...form, carton_cost: Number(e.target.value) })}
                  />
                </>
              )}
              {isWeightCat && (
                <>
                  <Input
                    label="المخزون (كجم)"
                    type="number"
                    min={0}
                    value={form.cartons}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        cartons: Number(e.target.value),
                        units_per_carton: 1,
                        unit: 'كجم',
                      })
                    }
                  />
                  <Input
                    label="سعر شراء الكجم"
                    type="number"
                    min={0}
                    value={form.carton_cost}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        carton_cost: Number(e.target.value),
                        units_per_carton: 1,
                        unit: 'كجم',
                      })
                    }
                  />
                </>
              )}
              <Input
                label={isWeightCat ? 'سعر بيع الكجم' : 'سعر بيع الوحدة'}
                type="number"
                min={0}
                value={form.price}
                onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
              />
            </div>
            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
              <div className="rounded-xl bg-surface px-3 py-2">
                <div className="text-xs text-muted">
                  {isWeightCat ? 'سعر الشراء / كجم' : 'سعر الشراء بالحبة (تلقائي)'}
                </div>
                <div className="font-bold tabular text-app">{formatMoney(unitCost, currency)}</div>
              </div>
              <div className="rounded-xl bg-surface px-3 py-2">
                <div className="text-xs text-muted">{isWeightCat ? 'المخزون' : 'إجمالي الحبات'}</div>
                <div className="font-bold tabular text-app">
                  {stockPieces} {isWeightCat ? 'كجم' : 'حبة'}
                </div>
              </div>
              <div className="rounded-xl bg-surface px-3 py-2">
                <div className="text-xs text-muted">{isWeightCat ? 'هامش الكجم' : 'هامش الحبة'}</div>
                <div className="font-bold tabular text-success">
                  {formatMoney(Number(form.price) - unitCost, currency)}
                </div>
              </div>
            </div>
          </div>

          <Input
            label="حد إعادة الطلب (حبة)"
            type="number"
            value={form.min_stock}
            onChange={(e) => setForm({ ...form, min_stock: Number(e.target.value) })}
          />
          <label className="flex items-center gap-2 rounded-xl border border-app bg-subtle px-3 py-3 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={form.sell_by_weight}
              onChange={(e) =>
                setForm({
                  ...form,
                  sell_by_weight: e.target.checked,
                  unit: e.target.checked ? 'كجم' : getCategoryMeta(form.category)?.defaultUnit || 'حبة',
                  units_per_carton: e.target.checked ? 1 : form.units_per_carton || 12,
                })
              }
            />
            <span>
              بيع بالوزن — السعر لكل كجم، والإدخال في نقطة البيع بالجرام (خضار، فواكه، لحوم، بهارات، مكسرات...)
            </span>
          </label>
          {form.sell_by_weight && (
            <div className="sm:col-span-2 rounded-xl bg-accent-soft/40 px-3 py-2 text-sm text-secondary">
              مثال: سعر الكجم {form.price || 0} → 250 غرام = {(((form.price || 0) * 250) / 1000).toFixed(0)}
            </div>
          )}
        </div>
      </Dialog>

      <Dialog
        open={restockOpen}
        onClose={() => setRestockOpen(false)}
        title={`توريد للمخزون — ${restockProduct?.name_ar || ''}`}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRestockOpen(false)}>
              إلغاء
            </Button>
            <Button loading={busy} onClick={saveRestock}>
              إضافة للكراتين
            </Button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="عدد الكراتين المضافة"
            type="number"
            min={1}
            value={restockCartons}
            onChange={(e) => setRestockCartons(Number(e.target.value) || 1)}
          />
          <Input
            label="سعر شراء الكرتون"
            type="number"
            value={restockCartonCost}
            onChange={(e) => setRestockCartonCost(Number(e.target.value) || 0)}
          />
        </div>
        <p className="mt-3 text-sm text-muted">
          سيُضاف {restockCartons * Number(restockProduct?.units_per_carton || 1)} حبة للمخزون، ويُحدَّث
          سعر الشراء بالحبة تلقائياً.
        </p>
      </Dialog>
    </div>
  );
}
