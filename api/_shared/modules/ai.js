import supabase from '../db-client.js';
import { withApi } from '../handler.js';
import { methodNotAllowed } from '../auth-middleware.js';

function n(v) {
  return Number(v || 0);
}

function completed(sales) {
  return (sales || []).filter((s) => s.status === 'completed' || s.status === 'partial_refund');
}

function daysAgo(d) {
  const x = new Date();
  x.setDate(x.getDate() - d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function inLastDays(dateStr, days) {
  if (!dateStr) return false;
  return new Date(dateStr).getTime() >= daysAgo(days).getTime();
}

function analyze(locale, sales, products, saleItems, expenses) {
  const ar = locale !== 'en';
  const done = completed(sales);
  const sales7 = done.filter((s) => inLastDays(s.created_at, 7));
  const sales30 = done.filter((s) => inLastDays(s.created_at, 30));
  const rev7 = sales7.reduce((a, s) => a + n(s.total), 0);
  const rev30 = sales30.reduce((a, s) => a + n(s.total), 0);
  const exp30 = (expenses || [])
    .filter((e) => inLastDays(e.expense_date || e.created_at, 30))
    .reduce((a, e) => a + n(e.amount), 0);

  const productMap = Object.fromEntries((products || []).map((p) => [p.id, p]));
  const saleIds30 = new Set(sales30.map((s) => s.id));
  const items30 = (saleItems || []).filter((i) => saleIds30.has(i.sale_id));

  let cogs30 = 0;
  const qtyByProduct = {};
  const revByProduct = {};
  for (const it of items30) {
    const pid = it.product_id;
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

  const lowStock = (products || []).filter(
    (p) => p.is_active !== false && n(p.stock) <= n(p.min_stock || 0)
  );
  const deadStock = (products || []).filter((p) => {
    if (p.is_active === false) return false;
    return !(qtyByProduct[p.id] || 0) && n(p.stock) > 0;
  });

  const topProducts = Object.entries(revByProduct)
    .map(([id, revenue]) => ({
      id: Number(id),
      name: productMap[id]?.name_ar || productMap[id]?.name || `#${id}`,
      revenue,
      qty: qtyByProduct[id] || 0,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);

  const reorderSuggestions = lowStock
    .map((p) => {
      const sold = qtyByProduct[p.id] || 0;
      const daily = sold / 30;
      const suggest = Math.max(n(p.min_stock) * 2, Math.ceil(daily * 14) || n(p.min_stock) || 1);
      return {
        id: p.id,
        name: p.name_ar || p.name,
        stock: n(p.stock),
        min: n(p.min_stock),
        suggestQty: suggest,
      };
    })
    .sort((a, b) => a.stock - b.stock);

  const insights = [
    {
      id: 'sales',
      type: 'sales',
      title: ar ? 'تحليل المبيعات' : 'Sales analysis',
      body: ar
        ? `7 أيام: ${Math.round(rev7)} · 30 يوماً: ${Math.round(rev30)} · فواتير الشهر: ${sales30.length}`
        : `7d: ${Math.round(rev7)} · 30d: ${Math.round(rev30)} · month invoices: ${sales30.length}`,
      severity: rev7 > 0 ? 'success' : 'warning',
    },
    {
      id: 'profit',
      type: 'profit',
      title: ar ? 'تحليل الأرباح' : 'Profit analysis',
      body: ar
        ? `مجمل ${Math.round(gross)} (هامش ${margin.toFixed(1)}%) · مصروفات ${Math.round(exp30)} · صافي ${Math.round(net)}`
        : `Gross ${Math.round(gross)} (${margin.toFixed(1)}% margin) · expenses ${Math.round(exp30)} · net ${Math.round(net)}`,
      severity: net >= 0 ? 'success' : 'danger',
    },
    {
      id: 'reorder',
      type: 'reorder',
      title: ar ? 'إعادة الطلب' : 'Reorder',
      body: ar
        ? reorderSuggestions.length
          ? `${reorderSuggestions.length} منتجات تحت الحد. مثال: ${reorderSuggestions
              .slice(0, 3)
              .map((r) => r.name)
              .join('، ')}`
          : 'لا توجد تنبيهات حد أدنى.'
        : reorderSuggestions.length
          ? `${reorderSuggestions.length} SKUs below min. e.g. ${reorderSuggestions
              .slice(0, 3)
              .map((r) => r.name)
              .join(', ')}`
          : 'No minimum-stock alerts.',
      severity: reorderSuggestions.length ? 'warning' : 'info',
    },
    {
      id: 'dead',
      type: 'deadstock',
      title: ar ? 'منتجات راكدة' : 'Dead stock',
      body: ar
        ? `${deadStock.length} بدون مبيعات 30 يوماً`
        : `${deadStock.length} with no 30-day sales`,
      severity: deadStock.length > 3 ? 'warning' : 'info',
    },
  ];

  return {
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
    deadStock: deadStock.slice(0, 50).map((p) => ({
      id: p.id,
      name: p.name_ar || p.name,
      stock: n(p.stock),
      value: n(p.stock) * n(p.cost),
    })),
    topProducts,
  };
}

function answer(question, analysis, locale) {
  const ar = locale !== 'en';
  const q = String(question || '').trim();
  const lower = q.toLowerCase();
  const hit = (words) => words.some((w) => lower.includes(w) || q.includes(w));

  if (!q) {
    return ar
      ? 'اسأل عن المبيعات أو الأرباح أو إعادة الطلب أو المنتجات الراكدة.'
      : 'Ask about sales, profit, reorder, or dead stock.';
  }
  if (hit(['راكد', 'dead', 'slow'])) {
    const d = analysis.deadStock;
    return ar
      ? `راكد: ${d.length}. ${d
          .slice(0, 10)
          .map((x) => x.name)
          .join('، ')}`
      : `Dead stock: ${d.length}. ${d
          .slice(0, 10)
          .map((x) => x.name)
          .join(', ')}`;
  }
  if (hit(['طلب', 'reorder', 'low', 'مخزون'])) {
    const r = analysis.reorderSuggestions;
    return r.length
      ? r
          .slice(0, 12)
          .map((x) => `• ${x.name}: ${x.stock}/${x.min} → ${x.suggestQty}`)
          .join('\n')
      : ar
        ? 'لا حاجة لإعادة طلب عاجلة.'
        : 'No urgent reorders.';
  }
  if (hit(['ربح', 'profit', 'هامش', 'margin'])) {
    const s = analysis.stats;
    return ar
      ? `صافي 30 يوماً ${Math.round(s.net_30d)} | هامش ${s.margin_pct.toFixed(1)}% | إيراد ${Math.round(s.revenue_30d)}`
      : `30d net ${Math.round(s.net_30d)} | margin ${s.margin_pct.toFixed(1)}% | revenue ${Math.round(s.revenue_30d)}`;
  }
  if (hit(['مبيعات', 'sales', 'إيراد', 'revenue'])) {
    const s = analysis.stats;
    return ar
      ? `7 أيام ${Math.round(s.revenue_7d)} (${s.invoices_7d}) · 30 يوماً ${Math.round(s.revenue_30d)} (${s.invoices_30d})`
      : `7d ${Math.round(s.revenue_7d)} (${s.invoices_7d}) · 30d ${Math.round(s.revenue_30d)} (${s.invoices_30d})`;
  }
  if (hit(['أفضل', 'top'])) {
    return analysis.topProducts.map((t, i) => `${i + 1}. ${t.name} — ${Math.round(t.revenue)}`).join('\n');
  }
  return analysis.insights.map((i) => `• ${i.title}: ${i.body}`).join('\n');
}

export const handler = withApi(
  async function handler(req, res, { auth, tenantId }) {
    const tid = tenantId;
    const locale = (req.query.locale || req.body?.locale || 'ar') === 'en' ? 'en' : 'ar';

    if (req.method === 'GET') {
      const [{ data: sales }, { data: products }, { data: expenses }] = await Promise.all([
        supabase.from('sales').select('*').eq('tenant_id', tid).order('created_at', { ascending: false }).limit(2000),
        supabase.from('products').select('*').eq('tenant_id', tid),
        supabase.from('expenses').select('*').eq('tenant_id', tid),
      ]);
      const saleIds = (sales || []).map((s) => s.id);
      let saleItems = [];
      if (saleIds.length) {
        const { data: items } = await supabase.from('sale_items').select('*').in('sale_id', saleIds);
        saleItems = items || [];
      }
      const analysis = analyze(locale, sales || [], products || [], saleItems, expenses || []);
      return res.status(200).json(analysis);
    }

    if (req.method === 'POST') {
      const message = String(req.body?.message || '').trim();
      if (!message) return res.status(400).json({ error: 'message required' });

      const [{ data: sales }, { data: products }, { data: expenses }] = await Promise.all([
        supabase.from('sales').select('*').eq('tenant_id', tid).limit(2000),
        supabase.from('products').select('*').eq('tenant_id', tid),
        supabase.from('expenses').select('*').eq('tenant_id', tid),
      ]);
      const saleIds = (sales || []).map((s) => s.id);
      let saleItems = [];
      if (saleIds.length) {
        const { data: items } = await supabase.from('sale_items').select('*').in('sale_id', saleIds);
        saleItems = items || [];
      }
      const analysis = analyze(locale, sales || [], products || [], saleItems, expenses || []);
      const ans = answer(message, analysis, locale);

      await supabase.from('ai_conversations').insert({
        tenant_id: tid,
        user_id: auth?.profile?.id || null,
        role: 'user',
        message,
        answer: ans,
        meta: { locale, stats: analysis.stats },
      });

      return res.status(200).json({ answer: ans, analysis });
    }

    return methodNotAllowed(res);
  },
  { permissions: { GET: 'ai:use', POST: 'ai:use' } }
);
