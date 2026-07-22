import { useEffect, useState } from 'react';
import { ChefHat, Factory, Plus } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Badge from '../components/ui/Badge';
import Dialog from '../components/ui/Dialog';
import { PageSkeleton } from '../components/ui/Skeleton';
import { useI18n } from '../contexts/I18nContext';
import type { Product } from '../lib/types';

interface RecipeItem {
  ingredient_product_id: number;
  quantity: number;
  unit?: string;
  waste_pct?: number;
}

interface Recipe {
  id: number;
  product_id: number;
  name: string;
  name_en?: string;
  yield_qty?: number;
  items: RecipeItem[];
  active?: boolean;
}

export default function Recipes() {
  const { locale, t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [open, setOpen] = useState(false);
  const [mfgOpen, setMfgOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Recipe | null>(null);
  const [mfgQty, setMfgQty] = useState(1);
  const [form, setForm] = useState({
    name: '',
    name_en: '',
    product_id: '',
    yield_qty: 1,
    ingredient_product_id: '',
    ingredient_qty: 1,
    waste_pct: 0,
  });
  const [items, setItems] = useState<RecipeItem[]>([]);

  const load = async () => {
    setLoading(true);
    const [rRes, pRes] = await Promise.all([fetch('/api/recipes'), fetch('/api/products')]);
    if (rRes.ok) setRecipes(await rRes.json());
    if (pRes.ok) setProducts(await pRes.json());
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const addItem = () => {
    if (!form.ingredient_product_id) return;
    setItems((prev) => [
      ...prev,
      {
        ingredient_product_id: Number(form.ingredient_product_id),
        quantity: Number(form.ingredient_qty || 1),
        waste_pct: Number(form.waste_pct || 0),
        unit: 'حبة',
      },
    ]);
  };

  const save = async () => {
    setBusy(true);
    await fetch('/api/recipes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create',
        name: form.name,
        name_en: form.name_en,
        product_id: Number(form.product_id),
        yield_qty: Number(form.yield_qty || 1),
        items,
      }),
    });
    setBusy(false);
    setOpen(false);
    setItems([]);
    load();
  };

  const manufacture = async () => {
    if (!selected) return;
    setBusy(true);
    const res = await fetch('/api/recipes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'manufacture',
        recipe_id: selected.id,
        quantity: mfgQty,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || 'Manufacture failed');
      return;
    }
    setMfgOpen(false);
    load();
  };

  const pname = (id: number) => {
    const p = products.find((x) => x.id === id);
    return p?.name_ar || p?.name || `#${id}`;
  };

  if (loading) return <PageSkeleton />;

  return (
    <div>
      <PageHeader
        title={t('recipes')}
        description={
          locale === 'ar'
            ? 'BOM · خصم مكونات · تصنيع يحدّث المخزون'
            : 'BOM · ingredient deduction · manufacturing updates stock'
        }
        actions={
          <Button
            onClick={() => {
              setItems([]);
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            {locale === 'ar' ? 'وصفة' : 'Recipe'}
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {recipes.map((r) => (
          <Card key={r.id}>
            <CardBody>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 font-semibold text-app">
                    <ChefHat className="h-4 w-4 text-primary" />
                    {locale === 'ar' ? r.name : r.name_en || r.name}
                  </div>
                  <div className="mt-1 text-sm text-muted">
                    FG: {pname(r.product_id)} · yield {r.yield_qty || 1}
                  </div>
                </div>
                <Badge tone={r.active === false ? 'default' : 'success'}>
                  {r.active === false ? t('inactive') : t('active')}
                </Badge>
              </div>
              <div className="mt-3 space-y-1 text-sm">
                {(r.items || []).map((it, idx) => (
                  <div key={idx} className="flex justify-between rounded-lg bg-muted px-2 py-1">
                    <span>{pname(it.ingredient_product_id)}</span>
                    <span className="tabular">
                      {it.quantity}
                      {it.waste_pct ? ` +${it.waste_pct}%` : ''}
                    </span>
                  </div>
                ))}
              </div>
              <Button
                className="mt-4 w-full"
                variant="soft"
                onClick={() => {
                  setSelected(r);
                  setMfgQty(1);
                  setMfgOpen(true);
                }}
              >
                <Factory className="h-4 w-4" />
                {t('manufacture')}
              </Button>
            </CardBody>
          </Card>
        ))}
        {!recipes.length && (
          <Card>
            <CardBody className="text-sm text-muted">{t('noData')}</CardBody>
          </Card>
        )}
      </div>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={locale === 'ar' ? 'وصفة جديدة' : 'New recipe'}
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t('cancel')}
            </Button>
            <Button loading={busy} onClick={save}>
              {t('save')}
            </Button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Name AR" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="Name EN" value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} />
          <Select
            label={locale === 'ar' ? 'المنتج النهائي' : 'Finished product'}
            value={form.product_id}
            onChange={(e) => setForm({ ...form, product_id: e.target.value })}
            placeholder="—"
            options={products.map((p) => ({ value: p.id, label: p.name_ar || p.name }))}
          />
          <Input
            label="Yield qty"
            type="number"
            value={form.yield_qty}
            onChange={(e) => setForm({ ...form, yield_qty: Number(e.target.value) })}
          />
        </div>
        <div className="mt-4 rounded-2xl border border-app p-3">
          <div className="mb-2 text-sm font-semibold">{locale === 'ar' ? 'مكونات' : 'Ingredients'}</div>
          <div className="grid gap-2 sm:grid-cols-4">
            <Select
              value={form.ingredient_product_id}
              onChange={(e) => setForm({ ...form, ingredient_product_id: e.target.value })}
              placeholder="Ingredient"
              options={products.map((p) => ({ value: p.id, label: p.name_ar || p.name }))}
            />
            <Input
              type="number"
              value={form.ingredient_qty}
              onChange={(e) => setForm({ ...form, ingredient_qty: Number(e.target.value) })}
              placeholder="Qty"
            />
            <Input
              type="number"
              value={form.waste_pct}
              onChange={(e) => setForm({ ...form, waste_pct: Number(e.target.value) })}
              placeholder="Waste %"
            />
            <Button type="button" variant="outline" onClick={addItem}>
              {t('add')}
            </Button>
          </div>
          <div className="mt-3 space-y-1 text-sm">
            {items.map((it, i) => (
              <div key={i} className="flex justify-between rounded-lg bg-muted px-2 py-1">
                <span>{pname(it.ingredient_product_id)}</span>
                <span>
                  {it.quantity} / waste {it.waste_pct || 0}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </Dialog>

      <Dialog
        open={mfgOpen}
        onClose={() => setMfgOpen(false)}
        title={`${t('manufacture')} — ${selected?.name || ''}`}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setMfgOpen(false)}>
              {t('cancel')}
            </Button>
            <Button loading={busy} onClick={manufacture}>
              {t('manufacture')}
            </Button>
          </div>
        }
      >
        <Input
          label={locale === 'ar' ? 'الكمية المنتجة' : 'Output quantity'}
          type="number"
          min={1}
          value={mfgQty}
          onChange={(e) => setMfgQty(Number(e.target.value) || 1)}
        />
        <p className="mt-3 text-sm text-muted">
          {locale === 'ar'
            ? 'سيتم خصم المكونات تلقائياً وزيادة مخزون المنتج النهائي.'
            : 'Ingredients will be deducted and finished-good stock increased.'}
        </p>
      </Dialog>
    </div>
  );
}
