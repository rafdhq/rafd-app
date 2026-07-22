import supabase from '../db-client.js';
import { withApi } from '../handler.js';
import { methodNotAllowed } from '../auth-middleware.js';

async function writeAudit(row) {
  try {
    await supabase.from('audit_logs').insert(row);
  } catch {
    /* ignore */
  }
}

export default withApi(
  async function handler(req, res, { auth, tenantId }) {
    if (req.method === 'GET') {
      let q = supabase.from('refunds').select('*').order('created_at', { ascending: false });
      if (tenantId) q = q.eq('tenant_id', tenantId);
      if (req.query.sale_id) q = q.eq('sale_id', req.query.sale_id);
      const { data, error } = await q.limit(100);
      if (error) throw error;
      return res.status(200).json(data || []);
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const saleId = body.sale_id;
      const items = Array.isArray(body.items) ? body.items : [];
      if (!saleId || !items.length) {
        return res.status(400).json({ error: 'sale_id and items required' });
      }

      const { data: sale, error: sErr } = await supabase.from('sales').select('*').eq('id', saleId).single();
      if (sErr || !sale) return res.status(404).json({ error: 'Sale not found' });
      if (tenantId && Number(sale.tenant_id) !== Number(tenantId) && auth.role !== 'superadmin') {
        return res.status(403).json({ error: 'Forbidden' });
      }
      if (sale.status === 'refunded') return res.status(400).json({ error: 'Sale already fully refunded' });

      const { data: saleItems } = await supabase.from('sale_items').select('*').eq('sale_id', saleId);
      const byId = Object.fromEntries((saleItems || []).map((i) => [i.id, i]));

      let refundTotal = 0;
      const refundLines = [];

      for (const it of items) {
        const src = byId[it.sale_item_id] || (saleItems || []).find((x) => x.product_id === it.product_id);
        if (!src) return res.status(400).json({ error: `Item not found: ${it.sale_item_id || it.product_id}` });

        const qty = Number(it.quantity || 0);
        if (qty <= 0) return res.status(400).json({ error: 'Invalid quantity' });
        if (qty > Number(src.quantity)) {
          return res.status(400).json({ error: `Refund qty exceeds sold qty for ${src.product_name}` });
        }

        const unit = Number(src.unit_price || 0);
        const lineTotal = Math.round(unit * qty * 100) / 100;
        refundTotal += lineTotal;
        refundLines.push({
          sale_item_id: src.id,
          product_id: src.product_id,
          product_name: src.product_name,
          quantity: qty,
          unit_price: unit,
          total: lineTotal,
          weight_g: src.weight_g || null,
        });
      }

      const mode = body.mode === 'exchange' ? 'exchange' : 'refund';
      const method = body.refund_method || 'cash';

      const { data: refund, error: rErr } = await supabase
        .from('refunds')
        .insert({
          tenant_id: sale.tenant_id,
          sale_id: sale.id,
          invoice_number: sale.invoice_number,
          mode,
          amount: refundTotal,
          refund_method: method,
          reason: body.reason || null,
          created_by: auth.profile.full_name || auth.profile.email,
          user_id: auth.profile.id,
          status: 'completed',
        })
        .select()
        .single();
      if (rErr) throw rErr;

      const rows = refundLines.map((l) => ({ ...l, refund_id: refund.id }));
      await supabase.from('refund_items').insert(rows);

      // Restock
      for (const l of refundLines) {
        const { data: prod } = await supabase.from('products').select('stock').eq('id', l.product_id).single();
        if (prod) {
          await supabase
            .from('products')
            .update({ stock: Number(prod.stock || 0) + Number(l.quantity) })
            .eq('id', l.product_id);
        }
      }

      // Mark original sale
      const full =
        refundLines.reduce((a, l) => a + Number(l.quantity), 0) >=
        (saleItems || []).reduce((a, l) => a + Number(l.quantity), 0);
      await supabase
        .from('sales')
        .update({ status: full ? 'refunded' : 'partial_refund' })
        .eq('id', sale.id);

      // Reverse customer credit portion if original was credit
      if (sale.customer_id && String(sale.payment_method).includes('credit')) {
        const { data: customer } = await supabase.from('customers').select('*').eq('id', sale.customer_id).single();
        if (customer) {
          const newBal = Math.max(0, Number(customer.balance || 0) - refundTotal);
          await supabase.from('customers').update({ balance: newBal }).eq('id', customer.id);
          await supabase.from('customer_ledger').insert({
            tenant_id: sale.tenant_id,
            customer_id: customer.id,
            type: 'payment',
            amount: refundTotal,
            balance_after: newBal,
            reference: `REF-${refund.id}`,
            notes: mode === 'exchange' ? 'استبدال' : 'مرتجع',
            sale_id: sale.id,
          });
        }
      }

      await writeAudit({
        tenant_id: sale.tenant_id,
        user_id: auth.profile.id,
        action: mode === 'exchange' ? 'sale.exchange' : 'sale.refund',
        entity_type: 'refunds',
        entity_id: String(refund.id),
        meta: { sale_id: sale.id, amount: refundTotal, items: refundLines.length },
      });

      return res.status(201).json({ ...refund, items: rows });
    }

    return methodNotAllowed(res);
  },
  {
    permissions: {
      GET: 'sales:read',
      POST: 'sales:refund',
    },
  }
);
