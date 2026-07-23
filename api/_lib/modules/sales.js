import { supabase } from '../db-client.js';
import { withApi } from '../handler.js';
import { writeAudit } from '../audit.js';

async function findIdempotentSale(tenantId, key) {
  if (!key) return null;
  const { data } = await supabase
    .from('sales')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('idempotency_key', key)
    .maybeSingle();
  return data || null;
}

function invoiceSuffix() {
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}

/**
 * BL-06: resolve the cashier's currently-open shift so every sale can be linked
 * to it for X/Z cash reconciliation. Soft link — never blocks a sale.
 */
async function resolveOpenShiftId(tenantId, userId, explicit) {
  if (explicit) return explicit;
  if (!userId) return null;
  const { data } = await supabase
    .from('cashier_shifts')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .eq('status', 'open')
    .order('opened_at', { ascending: false })
    .maybeSingle();
  return data?.id || null;
}

export const handler = withApi(
  async function handler(req, res, { auth, tenantId }) {
    if (req.method === 'GET') {
      const { status, id, customer_id, include_items } = req.query;
      let q = supabase.from('sales').select('*').order('created_at', { ascending: false });
      if (tenantId) q = q.eq('tenant_id', tenantId);
      if (status) q = q.eq('status', status);
      if (id) q = q.eq('id', id);
      if (customer_id) q = q.eq('customer_id', customer_id);
      const { data, error } = await q;
      if (error) throw error;

      if (id && data?.[0]) {
        if (tenantId && Number(data[0].tenant_id) !== Number(tenantId) && auth.role !== 'superadmin') {
          return res.status(403).json({ error: 'Forbidden' });
        }
        const { data: items } = await supabase.from('sale_items').select('*').eq('sale_id', id);
        return res.status(200).json({ ...data[0], items: items || [] });
      }

      const wantItems = include_items === '1' || include_items === 'true';
      if (wantItems && data?.length) {
        const ids = data.map((s) => s.id);
        const { data: allItems } = await supabase.from('sale_items').select('*').in('sale_id', ids);
        const bySale = {};
        for (const it of allItems || []) {
          if (!bySale[it.sale_id]) bySale[it.sale_id] = [];
          bySale[it.sale_id].push(it);
        }
        return res.status(200).json(data.map((s) => ({ ...s, items: bySale[s.id] || [] })));
      }

      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const tid = tenantId || body.tenant_id;
      if (!tid) return res.status(400).json({ error: 'tenant_id required' });

      const idem =
        body.idempotency_key ||
        req.headers['x-idempotency-key'] ||
        body.client_local_id ||
        null;

      if (idem) {
        const existing = await findIdempotentSale(tid, String(idem));
        if (existing) {
          const { data: items } = await supabase.from('sale_items').select('*').eq('sale_id', existing.id);
          return res.status(200).json({ ...existing, items: items || [], idempotent_replay: true });
        }
      }

      let method = body.payment_method || 'cash';
      if (method === 'transfer' && body.bank_account_id) {
        method = `transfer:${body.bank_account_id}`;
      }
      const isCredit = method === 'credit' || method === 'ajil' || String(method).startsWith('credit');
      const total = Number(body.total ?? 0);
      let paid = Number(body.paid ?? (isCredit ? 0 : total));
      if (isCredit) paid = Math.min(paid, total);

      const taxRate = Number(body.tax_rate ?? 0) || 0;
      const taxAmount = Number(body.tax ?? 0) || 0;

      const notesParts = [];
      if (body.notes) notesParts.push(body.notes);
      if (body.bank_account_id) notesParts.push(`bank_account_id=${body.bank_account_id}`);
      if (body.client_local_id) notesParts.push(`client_local_id=${body.client_local_id}`);

      const shiftId = await resolveOpenShiftId(tid, auth?.profile?.id, body.shift_id);

      const salePayload = {
        tenant_id: tid,
        branch_id: body.branch_id || null,
        shift_id: shiftId,
        invoice_number: body.invoice_number,
        customer_id: body.customer_id || null,
        customer_name: body.customer_name || 'عميل نقدي',
        subtotal: body.subtotal ?? 0,
        discount: body.discount ?? 0,
        tax: taxAmount,
        total,
        paid,
        payment_method: method,
        status: body.status || 'completed',
        notes: notesParts.join(' | ') || null,
        created_by: body.created_by || auth?.profile?.full_name || auth?.user?.email || null,
        idempotency_key: idem ? String(idem) : null,
        tax_rate: taxRate,
        tax_mode: body.tax_mode || null,
      };

      let sale = null;
      let invoiceAttempt = 0;
      while (sale == null) {
        const { data, error } = await supabase.from('sales').insert(salePayload).select().single();
        if (!error) {
          sale = data;
          break;
        }
        const msg = String(error.message || '');
        const code = error.code || '';

        // A concurrent idempotent replay won the race → return the winner rather
        // than creating a second sale (or re-decrementing stock).
        if (code === '23505' && msg.includes('idempotency') && idem) {
          const existing = await findIdempotentSale(tid, String(idem));
          if (existing) {
            const { data: exItems } = await supabase.from('sale_items').select('*').eq('sale_id', existing.id);
            return res.status(200).json({ ...existing, items: exItems || [], idempotent_replay: true });
          }
        }

        // BL-05: invoice_number collides for this (tenant, branch) — offline
        // devices/branches can mint the same number. Regenerate and retry.
        if (code === '23505' && invoiceAttempt < 5) {
          invoiceAttempt += 1;
          salePayload.invoice_number = `${body.invoice_number || 'INV'}-${invoiceSuffix()}`;
          continue;
        }

        // Older schema missing optional columns → drop them and retry once.
        if (msg.includes('column')) {
          delete salePayload.idempotency_key;
          delete salePayload.tax_rate;
          delete salePayload.tax_mode;
          delete salePayload.shift_id;
          const retry = await supabase.from('sales').insert(salePayload).select().single();
          if (retry.error) throw retry.error;
          sale = retry.data;
          break;
        }
        throw error;
      }

      const items = Array.isArray(body.items) ? body.items : [];
      if (items.length) {
        const rows = items.map((it) => {
          const weight_g =
            it.weight_g != null
              ? Number(it.weight_g)
              : it.sold_by_weight
                ? Math.round(Number(it.quantity || 0) * 1000)
                : null;
          return {
            sale_id: sale.id,
            product_id: it.product_id,
            product_name: it.product_name,
            quantity: it.quantity,
            unit_price: it.unit_price,
            total: it.total,
            weight_g,
            sold_by_weight: !!(it.sold_by_weight || weight_g),
          };
        });

        let itemsErr = (await supabase.from('sale_items').insert(rows)).error;
        if (itemsErr && String(itemsErr.message || '').includes('column')) {
          const basic = rows.map(({ weight_g, sold_by_weight, ...rest }) => rest);
          itemsErr = (await supabase.from('sale_items').insert(basic)).error;
        }
        if (itemsErr) throw itemsErr;

        if (sale.status === 'completed') {
          for (const it of items) {
            // BL-09: weight products are tracked in kilograms (price is per-kg and
            // POS already sends quantity in kg). Always deduct kg — never grams —
            // instead of guessing the unit from free text.
            let dec = Number(it.quantity) || 0;
            if ((it.sold_by_weight || it.weight_g != null) && it.weight_g != null) {
              dec = Number(it.weight_g) / 1000;
            }
            if (!it.product_id || !(dec > 0)) continue;

            // BL-02: single atomic decrement (row-locked UPDATE) — no read-then-write
            // race that lets concurrent cashiers oversell.
            // BL-12: store policy allows overselling; record any resulting deficit
            // (negative stock) for review instead of silently clamping to zero.
            const { data: rpc } = await supabase.rpc('pos_apply_stock_delta', {
              p_product_id: it.product_id,
              p_delta: -dec,
              p_block_negative: false,
            });
            const row = Array.isArray(rpc) ? rpc[0] : rpc;
            const newStock = row && row.new_stock != null ? Number(row.new_stock) : null;
            if (newStock != null && newStock < 0) {
              await writeAudit({
                tenantId: tid,
                userId: auth?.profile?.id || null,
                action: 'inventory.deficit',
                entityType: 'products',
                entityId: it.product_id,
                meta: {
                  sale_id: sale.id,
                  invoice_number: sale.invoice_number,
                  product_name: it.product_name,
                  requested_qty: dec,
                  resulting_stock: newStock,
                },
              });
            }
          }
        }
      }

      const creditAmount = total - paid;
      if (sale.customer_id && creditAmount > 0) {
        const { data: customer } = await supabase
          .from('customers')
          .select('*')
          .eq('id', sale.customer_id)
          .single();
        if (customer) {
          const newBalance = Number(customer.balance || 0) + creditAmount;
          const newPurchases = Number(customer.total_purchases || 0) + total;
          await supabase
            .from('customers')
            .update({ balance: newBalance, total_purchases: newPurchases })
            .eq('id', customer.id);
          await supabase.from('customer_ledger').insert({
            tenant_id: sale.tenant_id,
            customer_id: customer.id,
            type: 'sale_credit',
            amount: creditAmount,
            balance_after: newBalance,
            reference: sale.invoice_number,
            notes: 'بيع آجل',
            sale_id: sale.id,
          });
        }
      } else if (sale.customer_id && total > 0) {
        const { data: customer } = await supabase
          .from('customers')
          .select('*')
          .eq('id', sale.customer_id)
          .single();
        if (customer) {
          await supabase
            .from('customers')
            .update({ total_purchases: Number(customer.total_purchases || 0) + total })
            .eq('id', customer.id);
        }
      }

      // audit — BL-03: use the real audit_logs columns (user_id/entity_type/...)
      await writeAudit({
        tenantId: tid,
        userId: auth?.profile?.id || null,
        action: 'sale.create',
        entityType: 'sales',
        entityId: sale.id,
        meta: { invoice_number: sale.invoice_number, total, method, offline: !!body.client_local_id },
      });

      return res.status(201).json(sale);
    }

    if (req.method === 'PUT') {
      const { id, ...rest } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      let q = supabase.from('sales').update(rest).eq('id', id);
      if (tenantId && auth.role !== 'superadmin') q = q.eq('tenant_id', tenantId);
      const { data, error } = await q.select().single();
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      // only owner/manager/superadmin via permission sales:write — still block cashiers deleting via role matrix if needed
      if (auth.role === 'cashier') {
        return res.status(403).json({ error: 'Forbidden: cashiers cannot delete sales' });
      }
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      if (tenantId && auth.role !== 'superadmin') {
        const { data: row } = await supabase.from('sales').select('tenant_id').eq('id', id).single();
        if (row && Number(row.tenant_id) !== Number(tenantId)) {
          return res.status(403).json({ error: 'Forbidden' });
        }
      }
      await supabase.from('sale_items').delete().eq('sale_id', id);
      const { error } = await supabase.from('sales').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  },
  {
    permissions: {
      GET: 'sales:read',
      POST: 'sales:write',
      PUT: 'sales:write',
      DELETE: 'sales:write',
    },
  }
);
