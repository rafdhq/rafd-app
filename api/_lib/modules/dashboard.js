import { supabase } from '../db-client.js';
import { withApi } from '../handler.js';

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** Local YYYY-MM-DD (expenses.expense_date is a DATE column). */
function ymd(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function minusDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() - n);
  return x;
}

// Perf: sale_items was fetched with a bare select('*') — every row of every
// tenant on the platform, on every dashboard load. It has no tenant_id column,
// so it can only be scoped through its parent sale. We chunk the sale ids to
// stay under the request-URL limit, and page each chunk so a configured
// PostgREST row cap can never silently truncate the aggregate.
const SALE_ID_CHUNK = 100;
const PAGE_SIZE = 1000;

async function fetchSaleItemsForSales(saleIds, columns) {
  if (!saleIds.length) return [];
  const out = [];
  for (let i = 0; i < saleIds.length; i += SALE_ID_CHUNK) {
    const chunk = saleIds.slice(i, i + SALE_ID_CHUNK);
    let offset = 0;
    for (;;) {
      const { data, error } = await supabase
        .from('sale_items')
        .select(columns)
        .in('sale_id', chunk)
        .order('id', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) throw error;
      const rows = data || [];
      out.push(...rows);
      if (rows.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
  }
  return out;
}

export const handler = withApi(
  async function handler(req, res, { tenantId }) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const tenant_id = tenantId;

    const today = startOfDay();
    const month = startOfMonth();
    // The 7-day series can reach back past the 1st of the month, so the fetch
    // window is whichever boundary is earlier. Everything downstream still
    // filters in JS exactly as before, so the numbers are unchanged.
    const seriesStart = startOfDay(minusDays(new Date(), 6));
    const windowStart = month < seriesStart ? month : seriesStart;

    const [
      { data: sales },
      { data: expenses },
      { data: products },
      { count: customersCount },
      { data: recentSalesRows },
    ] = await Promise.all([
      supabase
        .from('sales')
        .select('id, total, status, created_at')
        .eq('tenant_id', tenant_id)
        .gte('created_at', windowStart.toISOString())
        .order('created_at', { ascending: false }),
      supabase
        .from('expenses')
        .select('amount, expense_date')
        .eq('tenant_id', tenant_id)
        .gte('expense_date', ymd(month)),
      supabase
        .from('products')
        .select('id, cost, stock, min_stock')
        .eq('tenant_id', tenant_id),
      supabase
        .from('customers')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant_id),
      // recent_sales is "latest 8 overall", not month-scoped — keep it separate
      // so narrowing the window above cannot change what the card shows.
      supabase
        .from('sales')
        .select('*')
        .eq('tenant_id', tenant_id)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(8),
    ]);

    const salesList = sales || [];
    const completed = salesList.filter((s) => s.status === 'completed');

    const salesToday = completed.filter((s) => new Date(s.created_at) >= today);
    const salesMonth = completed.filter((s) => new Date(s.created_at) >= month);
    const expensesMonth = (expenses || []).filter((e) => new Date(e.expense_date) >= month);

    const revenueToday = salesToday.reduce((a, s) => a + Number(s.total || 0), 0);
    const revenueMonth = salesMonth.reduce((a, s) => a + Number(s.total || 0), 0);
    const expensesTotal = expensesMonth.reduce((a, e) => a + Number(e.amount || 0), 0);

    // approximate profit from product margins on month sales
    const productMap = Object.fromEntries((products || []).map((p) => [p.id, p]));
    const monthItems = await fetchSaleItemsForSales(
      salesMonth.map((s) => s.id),
      'sale_id, product_id, product_name, quantity, unit_price, total'
    );
    const costMonth = monthItems.reduce((a, it) => {
      const p = productMap[it.product_id];
      const cost = p ? Number(p.cost) : Number(it.unit_price) * 0.7;
      return a + cost * Number(it.quantity);
    }, 0);
    const profitMonth = revenueMonth - costMonth - expensesTotal;

    const lowStock = (products || []).filter((p) => Number(p.stock) <= Number(p.min_stock));

    // top products — scoped to THIS tenant's current-month sales.
    // Previously this aggregated the unfiltered sale_items fetch, i.e. every
    // tenant's rows, so a merchant could see other stores' product names.
    // Approved behaviour change: the window is now the current month rather
    // than all time.
    const productAgg = {};
    for (const it of monthItems) {
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
      customers_count: customersCount || 0,
      products_count: (products || []).length,
      invoices_today: salesToday.length,
      top_products,
      sales_series,
      recent_sales: recentSalesRows || [],
      insights,
    });
  } catch (err) {
    console.error('dashboard API error:', err);
    res.status(500).json({ error: err.message });
  }
  },
  { permissions: { GET: 'dashboard:read' } }
);
