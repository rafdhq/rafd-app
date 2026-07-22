import supabase from './db-client.js';

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const tenant_id = req.query.tenant_id || 1;

    const [{ data: sales }, { data: expenses }, { data: products }, { data: customers }, { data: items }] =
      await Promise.all([
        supabase.from('sales').select('*').eq('tenant_id', tenant_id).order('created_at', { ascending: false }),
        supabase.from('expenses').select('*').eq('tenant_id', tenant_id),
        supabase.from('products').select('*').eq('tenant_id', tenant_id),
        supabase.from('customers').select('id').eq('tenant_id', tenant_id),
        supabase.from('sale_items').select('*'),
      ]);

    const salesList = sales || [];
    const completed = salesList.filter((s) => s.status === 'completed');
    const today = startOfDay();
    const month = startOfMonth();

    const salesToday = completed.filter((s) => new Date(s.created_at) >= today);
    const salesMonth = completed.filter((s) => new Date(s.created_at) >= month);
    const expensesMonth = (expenses || []).filter((e) => new Date(e.expense_date) >= month);

    const revenueToday = salesToday.reduce((a, s) => a + Number(s.total || 0), 0);
    const revenueMonth = salesMonth.reduce((a, s) => a + Number(s.total || 0), 0);
    const expensesTotal = expensesMonth.reduce((a, e) => a + Number(e.amount || 0), 0);

    // approximate profit from product margins on month sales
    const productMap = Object.fromEntries((products || []).map((p) => [p.id, p]));
    const monthSaleIds = new Set(salesMonth.map((s) => s.id));
    const monthItems = (items || []).filter((i) => monthSaleIds.has(i.sale_id));
    const costMonth = monthItems.reduce((a, it) => {
      const p = productMap[it.product_id];
      const cost = p ? Number(p.cost) : Number(it.unit_price) * 0.7;
      return a + cost * Number(it.quantity);
    }, 0);
    const profitMonth = revenueMonth - costMonth - expensesTotal;

    const lowStock = (products || []).filter((p) => Number(p.stock) <= Number(p.min_stock));

    // top products
    const productAgg = {};
    for (const it of items || []) {
      if (!productAgg[it.product_id]) {
        productAgg[it.product_id] = { name: it.product_name, qty: 0, revenue: 0 };
      }
      productAgg[it.product_id].qty += Number(it.quantity);
      productAgg[it.product_id].revenue += Number(it.total);
    }
    const top_products = Object.values(productAgg)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    // last 7 days series
    const sales_series = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString('en-US', { weekday: 'short' });
      const total = completed
        .filter((s) => String(s.created_at).slice(0, 10) === key)
        .reduce((a, s) => a + Number(s.total || 0), 0);
      sales_series.push({ day: label, total });
    }

    const insights = [];
    if (revenueToday > 0) {
      insights.push(`مبيعات اليوم ${revenueToday.toFixed(0)} — أداء قوي لنقطة البيع.`);
    } else {
      insights.push('لا توجد مبيعات اليوم بعد — ابدأ وردية نقطة البيع الآن.');
    }
    if (lowStock.length) {
      insights.push(`${lowStock.length} منتجات تحت الحد الأدنى للمخزون تحتاج إعادة طلب.`);
    }
    if (top_products[0]) {
      insights.push(`الأكثر مبيعاً: ${top_products[0].name} — ركّز على توفره في الرف.`);
    }
    if (profitMonth > 0) {
      insights.push(`هامش الربح الشهري إيجابي بحوالي ${profitMonth.toFixed(0)}.`);
    }
    insights.push('اقتراح ذكي: فعّل عروض الحزم على المشروبات والألبان لرفع متوسط الفاتورة.');

    return res.status(200).json({
      sales_today: salesToday.length,
      revenue_today: revenueToday,
      revenue_month: revenueMonth,
      profit_month: profitMonth,
      expenses_month: expensesTotal,
      low_stock_count: lowStock.length,
      customers_count: (customers || []).length,
      products_count: (products || []).length,
      invoices_today: salesToday.length,
      top_products,
      sales_series,
      recent_sales: completed.slice(0, 8),
      insights,
    });
  } catch (err) {
    console.error('dashboard API error:', err);
    res.status(500).json({ error: err.message });
  }
}
