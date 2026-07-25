import { supabase } from '../db-client.js';
import { withApi } from '../handler.js';
import { methodNotAllowed } from '../auth-middleware.js';

/** Inclusive end-of-day ISO bound matching inRange()'s `to` semantics. */
function endOfDayIso(to) {
  const end = new Date(to);
  end.setHours(23, 59, 59, 999);
  return end.toISOString();
}

/**
 * Push the requested range into SQL. inRange() still runs afterwards and stays
 * the source of truth, so results are identical — this only avoids shipping the
 * tenant's entire history over the wire.
 *
 * Used for sales.created_at, which inRange() reads directly: a NULL there makes
 * inRange() return false, and a NULL also fails gte/lte, so both agree.
 */
function applyRange(query, column, from, to) {
  let q = query;
  if (from) q = q.gte(column, new Date(from).toISOString());
  if (to) q = q.lte(column, endOfDayIso(to));
  return q;
}

/**
 * Range filter that keeps NULLs, for columns the caller reads with a fallback
 * (`expense_date || created_at`, `purchase_date || created_at`). Dropping NULL
 * rows in SQL would discard rows the JS would have matched via created_at, so
 * they are retained here and inRange() decides.
 */
function applyRangeKeepNull(query, column, from, to, format) {
  const enc = (v, isEnd) =>
    format === 'date'
      ? String(v).slice(0, 10)
      : isEnd
        ? endOfDayIso(v)
        : new Date(v).toISOString();

  if (from && to) {
    return query.or(
      `${column}.is.null,and(${column}.gte.${enc(from, false)},${column}.lte.${enc(to, true)})`
    );
  }
  if (from) return query.or(`${column}.is.null,${column}.gte.${enc(from, false)}`);
  if (to) return query.or(`${column}.is.null,${column}.lte.${enc(to, true)}`);
  return query;
}

// sale_items has no tenant_id, so it is scoped through its parent sale. Chunked
// to stay under the request-URL limit and paged so a PostgREST row cap cannot
// silently truncate COGS.
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

function inRange(dateStr, from, to) {
  if (!dateStr) return false;
  const t = new Date(dateStr).getTime();
  if (from && t < new Date(from).getTime()) return false;
  if (to) {
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    if (t > end.getTime()) return false;
  }
  return true;
}

export const handler = withApi(
  async function handler(req, res, { tenantId }) {
    if (req.method !== 'GET') return methodNotAllowed(res);

    const type = req.query.type || 'pnl';
    const from = req.query.from || null;
    const to = req.query.to || null;
    const tid = tenantId;

    if (type === 'pnl') {
      const [{ data: sales }, { data: expenses }, { data: products }, { data: purchases }] =
        await Promise.all([
          applyRange(
            supabase
              .from('sales')
              .select('id, total, discount, tax, status, created_at')
              .eq('tenant_id', tid),
            'created_at',
            from,
            to
          ),
          applyRangeKeepNull(
            supabase
              .from('expenses')
              .select('amount, category, expense_date, created_at')
              .eq('tenant_id', tid),
            'expense_date',
            from,
            to,
            'date'
          ),
          supabase.from('products').select('id, cost, price, name_ar, name').eq('tenant_id', tid),
          applyRangeKeepNull(
            supabase.from('purchases').select('total, purchase_date, created_at').eq('tenant_id', tid),
            'purchase_date',
            from,
            to,
            'timestamp'
          ),
        ]);

      const completed = (sales || []).filter(
        (s) => s.status === 'completed' || s.status === 'partial_refund'
      );
      const salesFiltered = completed.filter((s) => inRange(s.created_at, from, to));
      const expFiltered = (expenses || []).filter((e) => inRange(e.expense_date || e.created_at, from, to));
      const purFiltered = (purchases || []).filter((p) => inRange(p.purchase_date || p.created_at, from, to));

      const revenue = salesFiltered.reduce((a, s) => a + Number(s.total || 0), 0);
      const discounts = salesFiltered.reduce((a, s) => a + Number(s.discount || 0), 0);
      const tax = salesFiltered.reduce((a, s) => a + Number(s.tax || 0), 0);
      const expenseTotal = expFiltered.reduce((a, e) => a + Number(e.amount || 0), 0);
      const purchaseTotal = purFiltered.reduce((a, p) => a + Number(p.total || 0), 0);

      const productMap = Object.fromEntries((products || []).map((p) => [p.id, p]));
      const items = await fetchSaleItemsForSales(
        salesFiltered.map((s) => s.id),
        'sale_id, product_id, quantity, unit_price'
      );
      const cogs = items.reduce((a, it) => {
        const p = productMap[it.product_id];
        const cost = p ? Number(p.cost || 0) : Number(it.unit_price || 0) * 0.7;
        return a + cost * Number(it.quantity || 0);
      }, 0);

      const grossProfit = revenue - cogs;
      const netProfit = grossProfit - expenseTotal;

      const byDay = {};
      for (const s of salesFiltered) {
        const d = String(s.created_at).slice(0, 10);
        byDay[d] = (byDay[d] || 0) + Number(s.total || 0);
      }

      const expenseByCat = {};
      for (const e of expFiltered) {
        const c = e.category || 'أخرى';
        expenseByCat[c] = (expenseByCat[c] || 0) + Number(e.amount || 0);
      }

      return res.status(200).json({
        type: 'pnl',
        from,
        to,
        revenue,
        discounts,
        tax,
        cogs,
        gross_profit: grossProfit,
        expenses: expenseTotal,
        purchases: purchaseTotal,
        net_profit: netProfit,
        invoices_count: salesFiltered.length,
        revenue_by_day: Object.entries(byDay)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([day, total]) => ({ day, total })),
        expenses_by_category: Object.entries(expenseByCat).map(([category, total]) => ({
          category,
          total,
        })),
      });
    }

    if (type === 'sales_export') {
      const { data: sales } = await supabase
        .from('sales')
        .select('*')
        .eq('tenant_id', tid)
        .order('created_at', { ascending: false });
      const rows = (sales || []).filter((s) => inRange(s.created_at, from, to));
      return res.status(200).json({
        type: 'sales_export',
        columns: [
          'invoice_number',
          'created_at',
          'customer_name',
          'payment_method',
          'subtotal',
          'discount',
          'tax',
          'total',
          'paid',
          'status',
          'created_by',
        ],
        rows: rows.map((s) => ({
          invoice_number: s.invoice_number,
          created_at: s.created_at,
          customer_name: s.customer_name,
          payment_method: s.payment_method,
          subtotal: s.subtotal,
          discount: s.discount,
          tax: s.tax,
          total: s.total,
          paid: s.paid,
          status: s.status,
          created_by: s.created_by,
        })),
      });
    }

    if (type === 'inventory_export') {
      const { data: products } = await supabase
        .from('products')
        .select('*')
        .eq('tenant_id', tid)
        .order('name_ar', { ascending: true });
      return res.status(200).json({
        type: 'inventory_export',
        columns: ['sku', 'barcode', 'name_ar', 'category', 'stock', 'min_stock', 'cost', 'price', 'unit'],
        rows: (products || []).map((p) => ({
          sku: p.sku,
          barcode: p.barcode,
          name_ar: p.name_ar || p.name,
          category: p.category,
          stock: p.stock,
          min_stock: p.min_stock,
          cost: p.cost,
          price: p.price,
          unit: p.unit,
        })),
      });
    }

    return res.status(400).json({ error: 'Unknown report type' });
  },
  { permissions: { GET: 'reports:read' } }
);
