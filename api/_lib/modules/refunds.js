import { supabase } from '../db-client.js';
import { withApi } from '../handler.js';
import { methodNotAllowed } from '../auth-middleware.js';
import { writeAudit } from '../audit.js';
import { validateRefundQuantities } from '../refund-math.js';

export const handler = withApi(
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

      // BL-04: load everything already refunded against THIS sale so the guard is
      // cumulative (sold − already refunded), not just against the original qty.
      const { data: priorRefunds } = await supabase.from('refunds').select('id').eq('sale_id', saleId);
      const priorRefundIds = (priorRefunds || []).map((r) => r.id);
      let priorRefundItems = [];
      if (priorRefundIds.length) {
        const { data } = await supabase
          .from('refund_items')
          .select('sale_item_id, quantity')
          .in('refund_id', priorRefundIds);
        priorRefundItems = data || [];
      }
      const soldByItemId = {};
      for (const si of saleItems || []) soldByItemId[si.id] = Number(si.quantity || 0);
      const priorByItemId = {};
      for (const ri of priorRefundItems) {
        if (ri.sale_item_id != null) {
          priorByItemId[ri.sale_item_id] = (priorByItemId[ri.sale_item_id] || 0) + Number(ri.quantity || 0);
        }
      }

      // Resolve each requested line to its source sale_item.
      const resolved = [];
      for (const it of items) {
        const src = byId[it.sale_item_id] || (saleItems || []).find((x) => x.product_id === it.product_id);
        if (!src) return res.status(400).json({ error: `Item not found: ${it.sale_item_id || it.product_id}` });
        resolved.push({ src, quantity: Number(it.quantity || 0) });
      }

      const check = validateRefundQuantities(
        soldByItemId,
        priorByItemId,
        resolved.map((r) => ({ saleItemId: r.src.id, quantity: r.quantity }))
      );
      if (!check.ok) {
        const bad = resolved.find((r) => r.src.id === check.saleItemId)?.src;
        if (check.error === 'invalid_quantity') {
          return res.status(400).json({ error: 'Invalid quantity' });
        }
        return res.status(400).json({
          error: `Refund qty exceeds remaining refundable qty for ${bad?.product_name || 'item'} (remaining ${check.remaining})`,
        });
      }

      let refundTotal = 0;
      const refundLines = [];
      for (const { src, quantity: qty } of resolved) {
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

      // Restock — BL-02: atomic increment (single locked UPDATE) instead of
      // read-then-write, matching the sale-deduction path.
      for (const l of refundLines) {
        if (!l.product_id || !(Number(l.quantity) > 0)) continue;
        await supabase.rpc('pos_apply_stock_delta', {
          p_product_id: l.product_id,
          p_delta: Number(l.quantity),
          p_block_negative: false,
        });
      }

      // Mark original sale — BL-04: base "fully refunded" on the CUMULATIVE
      // refunded quantity (prior refunds + this one), not just this request.
      const thisByItemId = {};
      for (const l of refundLines) thisByItemId[l.sale_item_id] = (thisByItemId[l.sale_item_id] || 0) + Number(l.quantity);
      let totalSold = 0;
      let totalRefunded = 0;
      for (const si of saleItems || []) {
        const sold = Number(si.quantity || 0);
        totalSold += sold;
        totalRefunded += Math.min(sold, (priorByItemId[si.id] || 0) + (thisByItemId[si.id] || 0));
      }
      const full = totalSold > 0 && totalRefunded >= totalSold;
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
        tenantId: sale.tenant_id,
        userId: auth.profile.id,
        action: mode === 'exchange' ? 'sale.exchange' : 'sale.refund',
        entityType: 'refunds',
        entityId: refund.id,
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
