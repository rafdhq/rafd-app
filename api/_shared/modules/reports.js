import supabase from '../db-client.js';
import { withApi } from '../handler.js';
import { methodNotAllowed } from '../auth-middleware.js';

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
      const [{ data: sales }, { data: expenses }, { data: products }, { data: items }, { data: purchases }] =
        await Promise.all([
          supabase.from('sales').select('*').eq('tenant_id', tid),
          supabase.from('expenses').select('*').eq('tenant_id', tid),
          supabase.from('products').select('id, cost, price, name_ar, name').eq('tenant_id', tid),
          supabase.from('sale_items').select('*'),
          supabase.from('purchases').select('*').eq('tenant_id', tid),
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
      const saleIds = new Set(salesFiltered.map((s) => s.id));
      const cogs = (items || [])
        .filter((i) => saleIds.has(i.sale_id))
        .reduce((a, it) => {
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
