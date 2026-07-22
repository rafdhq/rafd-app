/**
 * Deterministic on-device / server AI insights engine for RAFD.
 * No external LLM required — Arabic + English answers from live retail data.
 */

export type InsightLocale = 'ar' | 'en';

export interface SalesRow {
  id: number;
  total?: number | string;
  discount?: number | string;
  status?: string;
  created_at?: string;
  payment_method?: string;
}

export interface ProductRow {
  id: number;
  name?: string;
  name_ar?: string;
  price?: number | string;
  cost?: number | string;
  stock?: number | string;
  min_stock?: number | string;
  category?: string;
  is_active?: boolean;
}

export interface SaleItemRow {
  sale_id?: number;
  product_id: number;
  product_name?: string;
  quantity?: number | string;
  total?: number | string;
  unit_price?: number | string;
}

export interface ExpenseRow {
  amount?: number | string;
  expense_date?: string;
  category?: string;
}

export interface AiEngineInput {
  sales: SalesRow[];
  products: ProductRow[];
  saleItems: SaleItemRow[];
  expenses: ExpenseRow[];
  locale?: InsightLocale;
  currency?: string;
}

export interface AiInsight {
  id: string;
  type: 'sales' | 'reorder' | 'deadstock' | 'profit' | 'general';
  title: string;
  body: string;
  severity: 'info' | 'success' | 'warning' | 'danger';
  metrics?: Record<string, number | string>;
}

function n(v: unknown) {
  return Number(v || 0);
}

function completedSales(sales: SalesRow[]) {
  return (sales || []).filter((s) => s.status === 'completed' || s.status === 'partial_refund');
}

function daysAgo(d: number) {
  const x = new Date();
  x.setDate(x.getDate() - d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function inLastDays(dateStr: string | undefined, days: number) {
  if (!dateStr) return false;
  return new Date(dateStr).getTime() >= daysAgo(days).getTime();
}

export function analyzeRetail(input: AiEngineInput) {
  const locale = input.locale || 'ar';
  const ar = locale === 'ar';
  const sales = completedSales(input.sales);
  const sales7 = sales.filter((s) => inLastDays(s.created_at, 7));
  const sales30 = sales.filter((s) => inLastDays(s.created_at, 30));
  const rev7 = sales7.reduce((a, s) => a + n(s.total), 0);
  const rev30 = sales30.reduce((a, s) => a + n(s.total), 0);
  const exp30 = (input.expenses || [])
    .filter((e) => inLastDays(e.expense_date, 30))
    .reduce((a, e) => a + n(e.amount), 0);

  const productMap = Object.fromEntries((input.products || []).map((p) => [p.id, p]));
  const saleIds30 = new Set(sales30.map((s) => s.id));
  const items30 = (input.saleItems || []).filter((i) => saleIds30.has(Number(i.sale_id)));

  let cogs30 = 0;
  const qtyByProduct: Record<number, number> = {};
  const revByProduct: Record<number, number> = {};
  for (const it of items30) {
    const pid = Number(it.product_id);
    const qty = n(it.quantity);
    qtyByProduct[pid] = (qtyByProduct[pid] || 0) + qty;
    revByProduct[pid] = (revByProduct[pid] || 0) + n(it.total);
    const p = productMap[pid];
    const cost = p ? n(p.cost) : n(it.unit_price) * 0.7;
    cogs30 += cost * qty;
  }

  const gross = rev30 - cogs30;
  const net = gross - exp30;
  const margin = rev30 > 0 ? (gross / rev30) * 100 : 0;

  const lowStock = (input.products || []).filter(
    (p) => p.is_active !== false && n(p.stock) <= n(p.min_stock || 0)
  );

  const deadStock = (input.products || []).filter((p) => {
    if (p.is_active === false) return false;
    const sold = qtyByProduct[p.id] || 0;
    return sold === 0 && n(p.stock) > 0;
  });

  const top = Object.entries(revByProduct)
    .map(([id, revenue]) => ({
      id: Number(id),
      name: productMap[Number(id)]?.name_ar || productMap[Number(id)]?.name || `#${id}`,
      revenue,
      qty: qtyByProduct[Number(id)] || 0,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const reorderSuggestions = lowStock
    .map((p) => {
      const sold = qtyByProduct[p.id] || 0;
      const daily = sold / 30;
      const cover = daily > 0 ? n(p.stock) / daily : 999;
      const suggest = Math.max(n(p.min_stock) * 2, Math.ceil(daily * 14));
      return {
        id: p.id,
        name: p.name_ar || p.name || String(p.id),
        stock: n(p.stock),
        min: n(p.min_stock),
        suggestQty: suggest,
        daysCover: Math.round(cover * 10) / 10,
      };
    })
    .sort((a, b) => a.stock - b.stock);

  const insights: AiInsight[] = [];

  insights.push({
    id: 'sales-7',
    type: 'sales',
    title: ar ? 'أداء المبيعات (7 أيام)' : 'Sales performance (7 days)',
    body: ar
      ? `إيراد آخر 7 أيام ${Math.round(rev7).toLocaleString('en-US')} عبر ${sales7.length} فاتورة. متوسط الفاتورة ${sales7.length ? Math.round(rev7 / sales7.length).toLocaleString('en-US') : 0}.`
      : `Last 7 days revenue ${Math.round(rev7).toLocaleString('en-US')} across ${sales7.length} invoices. Avg ticket ${sales7.length ? Math.round(rev7 / sales7.length).toLocaleString('en-US') : 0}.`,
    severity: rev7 > 0 ? 'success' : 'warning',
    metrics: { revenue_7d: rev7, invoices_7d: sales7.length },
  });

  insights.push({
    id: 'profit-30',
    type: 'profit',
    title: ar ? 'تحليل الأرباح (30 يوماً)' : 'Profit analysis (30 days)',
    body: ar
      ? `الإيراد ${Math.round(rev30).toLocaleString('en-US')} · تكلفة البضاعة ${Math.round(cogs30).toLocaleString('en-US')} · مجمل ${Math.round(gross).toLocaleString('en-US')} (هامش ${margin.toFixed(1)}%) · مصروفات ${Math.round(exp30).toLocaleString('en-US')} · صافي ${Math.round(net).toLocaleString('en-US')}.`
      : `Revenue ${Math.round(rev30).toLocaleString('en-US')} · COGS ${Math.round(cogs30).toLocaleString('en-US')} · Gross ${Math.round(gross).toLocaleString('en-US')} (${margin.toFixed(1)}% margin) · Expenses ${Math.round(exp30).toLocaleString('en-US')} · Net ${Math.round(net).toLocaleString('en-US')}.`,
    severity: net >= 0 ? 'success' : 'danger',
    metrics: { revenue_30d: rev30, cogs_30d: cogs30, gross_30d: gross, net_30d: net, margin_pct: margin },
  });

  insights.push({
    id: 'reorder',
    type: 'reorder',
    title: ar ? 'اقتراحات إعادة الطلب' : 'Reorder suggestions',
    body:
      reorderSuggestions.length === 0
        ? ar
          ? 'لا توجد منتجات تحت الحد الأدنى حالياً.'
          : 'No products are below minimum stock right now.'
        : ar
          ? `${reorderSuggestions.length} منتج يحتاج إعادة طلب. أبرزها: ${reorderSuggestions
              .slice(0, 3)
              .map((r) => `${r.name} (متاح ${r.stock}، اقترح ${r.suggestQty})`)
              .join(' · ')}`
          : `${reorderSuggestions.length} SKUs need reorder. Top: ${reorderSuggestions
              .slice(0, 3)
              .map((r) => `${r.name} (stock ${r.stock}, suggest ${r.suggestQty})`)
              .join(' · ')}`,
    severity: reorderSuggestions.length ? 'warning' : 'info',
    metrics: { low_stock_count: reorderSuggestions.length },
  });

  insights.push({
    id: 'deadstock',
    type: 'deadstock',
    title: ar ? 'منتجات راكدة (30 يوماً بلا بيع)' : 'Dead stock (no sales in 30 days)',
    body:
      deadStock.length === 0
        ? ar
          ? 'لا يوجد راكد واضح ضمن المخزون النشط.'
          : 'No clear dead stock among active inventory.'
        : ar
          ? `${deadStock.length} منتج راكد. أمثلة: ${deadStock
              .slice(0, 5)
              .map((p) => p.name_ar || p.name)
              .join(' · ')}. فكّر في عرض ترويجي أو تخفيض.`
          : `${deadStock.length} slow movers. Examples: ${deadStock
              .slice(0, 5)
              .map((p) => p.name_ar || p.name)
              .join(' · ')}. Consider promos or markdowns.`,
    severity: deadStock.length > 5 ? 'warning' : 'info',
    metrics: { dead_count: deadStock.length },
  });

  if (top[0]) {
    insights.push({
      id: 'top-sku',
      type: 'sales',
      title: ar ? 'الأكثر ربحاً/مبيعاً' : 'Top sellers',
      body: ar
        ? `الأعلى إيراداً: ${top[0].name} (${Math.round(top[0].revenue).toLocaleString('en-US')}). حافظ على توفره في الرف.`
        : `Top revenue SKU: ${top[0].name} (${Math.round(top[0].revenue).toLocaleString('en-US')}). Keep it in stock.`,
      severity: 'success',
    });
  }

  return {
    locale,
    insights,
    stats: {
      revenue_7d: rev7,
      revenue_30d: rev30,
      cogs_30d: cogs30,
      gross_30d: gross,
      expenses_30d: exp30,
      net_30d: net,
      margin_pct: margin,
      invoices_7d: sales7.length,
      invoices_30d: sales30.length,
    },
    reorderSuggestions,
    deadStock: deadStock.map((p) => ({
      id: p.id,
      name: p.name_ar || p.name,
      stock: n(p.stock),
      value: n(p.stock) * n(p.cost),
    })),
    topProducts: top,
  };
}

export function answerManagerQuestion(question: string, analysis: ReturnType<typeof analyzeRetail>) {
  const q = (question || '').trim();
  const ar = analysis.locale !== 'en';
  const lower = q.toLowerCase();

  const hit = (words: string[]) => words.some((w) => lower.includes(w) || q.includes(w));

  if (!q) {
    return ar
      ? 'اسأل عن المبيعات، الأرباح، إعادة الطلب، أو المنتجات الراكدة.'
      : 'Ask about sales, profit, reorder, or dead stock.';
  }

  if (hit(['راكد', 'dead', 'slow', 'بطيء'])) {
    const d = analysis.deadStock;
    return ar
      ? `يوجد ${d.length} منتج راكد. ${d
          .slice(0, 8)
          .map((x) => `${x.name} (مخزون ${x.stock})`)
          .join('، ') || 'لا بيانات'}`
      : `${d.length} dead-stock SKUs. ${d
          .slice(0, 8)
          .map((x) => `${x.name} (stock ${x.stock})`)
          .join(', ') || 'none'}`;
  }

  if (hit(['طلب', 'reorder', 'مخزون منخفض', 'low stock', 'إعادة'])) {
    const r = analysis.reorderSuggestions;
    return ar
      ? r.length
        ? `اقتراحات إعادة الطلب:\n${r
            .slice(0, 10)
            .map((x) => `• ${x.name}: متاح ${x.stock} / حد ${x.min} → اطلب حوالي ${x.suggestQty}`)
            .join('\n')}`
        : 'المخزون فوق الحدود الدنيا حالياً.'
      : r.length
        ? `Reorder list:\n${r
            .slice(0, 10)
            .map((x) => `• ${x.name}: stock ${x.stock} / min ${x.min} → order ~${x.suggestQty}`)
            .join('\n')}`
        : 'Stock levels are above minimums.';
  }

  if (hit(['ربح', 'profit', 'هامش', 'margin', 'cogs', 'تكلفة'])) {
    const s = analysis.stats;
    return ar
      ? `آخر 30 يوماً — إيراد: ${Math.round(s.revenue_30d).toLocaleString('en-US')}، COGS: ${Math.round(s.cogs_30d).toLocaleString('en-US')}، مجمل: ${Math.round(s.gross_30d).toLocaleString('en-US')} (هامش ${s.margin_pct.toFixed(1)}%)، مصروفات: ${Math.round(s.expenses_30d).toLocaleString('en-US')}، صافي: ${Math.round(s.net_30d).toLocaleString('en-US')}.`
      : `Last 30 days — revenue ${Math.round(s.revenue_30d).toLocaleString('en-US')}, COGS ${Math.round(s.cogs_30d).toLocaleString('en-US')}, gross ${Math.round(s.gross_30d).toLocaleString('en-US')} (${s.margin_pct.toFixed(1)}% margin), expenses ${Math.round(s.expenses_30d).toLocaleString('en-US')}, net ${Math.round(s.net_30d).toLocaleString('en-US')}.`;
  }

  if (hit(['مبيعات', 'sales', 'إيراد', 'revenue', 'فاتورة'])) {
    const s = analysis.stats;
    return ar
      ? `مبيعات 7 أيام: ${Math.round(s.revenue_7d).toLocaleString('en-US')} (${s.invoices_7d} فاتورة). مبيعات 30 يوماً: ${Math.round(s.revenue_30d).toLocaleString('en-US')} (${s.invoices_30d} فاتورة).`
      : `7-day sales: ${Math.round(s.revenue_7d).toLocaleString('en-US')} (${s.invoices_7d} invoices). 30-day sales: ${Math.round(s.revenue_30d).toLocaleString('en-US')} (${s.invoices_30d} invoices).`;
  }

  if (hit(['أفضل', 'top', 'أكثر'])) {
    return ar
      ? `أفضل المنتجات:\n${analysis.topProducts.map((t, i) => `${i + 1}. ${t.name} — ${Math.round(t.revenue).toLocaleString('en-US')}`).join('\n') || 'لا بيانات'}`
      : `Top products:\n${analysis.topProducts.map((t, i) => `${i + 1}. ${t.name} — ${Math.round(t.revenue).toLocaleString('en-US')}`).join('\n') || 'No data'}`;
  }

  // default: summarize all insights
  return analysis.insights.map((i) => `• ${i.title}: ${i.body}`).join('\n\n');
}
