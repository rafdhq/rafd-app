import { useEffect, useMemo, useState } from 'react';
import { Layers, Wand2 } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Badge from '../components/ui/Badge';
import { Table, THead, TH, TBody, TD } from '../components/ui/Table';
import { PageSkeleton } from '../components/ui/Skeleton';
import { useI18n } from '../contexts/I18nContext';
import { formatMoney } from '../lib/utils';
import { useTenant } from '../contexts/TenantContext';

interface PriceList {
  id: number;
  code: string;
  name: string;
  name_en?: string;
  is_default?: boolean;
}

export default function Pricing() {
  const { locale, t } = useI18n();
  const { tenant } = useTenant();
  const currency = tenant?.currency || 'YER';
  const [loading, setLoading] = useState(true);
  const [lists, setLists] = useState<PriceList[]>([]);
  const [productPrices, setProductPrices] = useState<Array<Record<string, unknown>>>([]);
  const [products, setProducts] = useState<Array<Record<string, unknown>>>([]);
  const [listId, setListId] = useState<number | ''>('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Record<number, string>>({});

  const load = async () => {
    setLoading(true);
    const res = await fetch('/api/pricing');
    if (res.ok) {
      const data = await res.json();
      setLists(data.lists || []);
      setProductPrices(data.product_prices || []);
      setProducts(data.products || []);
      const def = (data.lists || []).find((l: PriceList) => l.is_default) || data.lists?.[0];
      if (def) setListId(def.id);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const priceMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const row of productPrices) {
      m[`${row.product_id}:${row.price_list_id}`] = Number(row.price);
    }
    return m;
  }, [productPrices]);

  const seed = async () => {
    setBusy(true);
    await fetch('/api/pricing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'seed_from_base' }),
    });
    setBusy(false);
    load();
  };

  const saveOne = async (productId: number) => {
    if (!listId) return;
    const price = Number(draft[productId] ?? priceMap[`${productId}:${listId}`] ?? 0);
    setBusy(true);
    await fetch('/api/pricing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'set_product_price',
        product_id: productId,
        price_list_id: listId,
        price,
      }),
    });
    setBusy(false);
    load();
  };

  if (loading) return <PageSkeleton />;

  return (
    <div>
      <PageHeader
        title={t('pricing')}
        description={
          locale === 'ar'
            ? 'قطاعي · جملة · نصف جملة · VIP · حسب العميل/الفرع'
            : 'Retail · wholesale · half-wholesale · VIP · customer/branch'
        }
        actions={
          <Button loading={busy} variant="soft" onClick={seed}>
            <Wand2 className="h-4 w-4" />
            {locale === 'ar' ? 'توليد من السعر الأساسي' : 'Seed from base price'}
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {lists.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => setListId(l.id)}
            className={`rounded-full px-4 py-2 text-sm font-medium border transition ${
              listId === l.id ? 'border-primary bg-primary-soft text-primary' : 'border-app bg-surface'
            }`}
          >
            {locale === 'ar' ? l.name : l.name_en || l.name}
            {l.is_default && (
              <Badge tone="primary" className="ms-2">
                default
              </Badge>
            )}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader
          title={
            <span className="inline-flex items-center gap-2">
              <Layers className="h-4 w-4" />
              {locale === 'ar' ? 'أسعار المنتجات للقائمة المحددة' : 'Product prices for selected list'}
            </span>
          }
        />
        <CardBody className="pt-0">
          <Table className="border-0">
            <THead>
              <TH>{locale === 'ar' ? 'المنتج' : 'Product'}</TH>
              <TH>SKU</TH>
              <TH>{locale === 'ar' ? 'أساسي' : 'Base'}</TH>
              <TH>{locale === 'ar' ? 'سعر القائمة' : 'List price'}</TH>
              <TH></TH>
            </THead>
            <TBody>
              {products.map((p) => {
                const id = Number(p.id);
                const current = priceMap[`${id}:${listId}`];
                return (
                  <tr key={id}>
                    <TD className="font-medium">{String(p.name_ar || p.name)}</TD>
                    <TD className="font-mono text-xs">{String(p.sku || '')}</TD>
                    <TD className="tabular">{formatMoney(Number(p.price || 0), currency)}</TD>
                    <TD>
                      <Input
                        type="number"
                        className="h-9"
                        value={draft[id] ?? (current != null ? String(current) : String(p.price || 0))}
                        onChange={(e) => setDraft({ ...draft, [id]: e.target.value })}
                      />
                    </TD>
                    <TD>
                      <Button size="sm" variant="outline" loading={busy} onClick={() => saveOne(id)}>
                        {t('save')}
                      </Button>
                    </TD>
                  </tr>
                );
              })}
            </TBody>
          </Table>
        </CardBody>
      </Card>

      <Card className="mt-4">
        <CardHeader title={locale === 'ar' ? 'ملاحظة تكامل POS' : 'POS integration note'} />
        <CardBody className="text-sm text-secondary">
          {locale === 'ar'
            ? 'يمكن تمرير price_list_code أو price_list_id مع customer_id و branch_id إلى /api/pricing?action=resolve للحصول على السعر النهائي حسب الأولوية: عميل → فرع → قائمة → أساسي.'
            : 'Pass price_list_code or price_list_id with customer_id and branch_id to /api/pricing?action=resolve. Priority: customer → branch → list → base.'}
        </CardBody>
      </Card>
    </div>
  );
}
