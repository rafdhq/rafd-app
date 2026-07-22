import supabase from '../db-client.js';
import { withApi } from '../handler.js';
import { methodNotAllowed } from '../auth-middleware.js';

async function writeAudit({ tenantId, userId, action, entity, entityId, meta }) {
  try {
    await supabase.from('audit_logs').insert({
      tenant_id: tenantId,
      user_id: userId || null,
      action,
      entity_type: entity,
      entity_id: entityId != null ? String(entityId) : null,
      meta: meta || {},
    });
  } catch {
    /* non-blocking */
  }
}

export const handler = withApi(
  async function handler(req, res, { auth, tenantId }) {
    if (req.method === 'GET') {
      const { status, id, open_only } = req.query;
      let q = supabase.from('cashier_shifts').select('*').order('opened_at', { ascending: false });
      if (tenantId) q = q.eq('tenant_id', tenantId);
      if (status) q = q.eq('status', status);
      if (id) q = q.eq('id', id);
      if (open_only === '1' || open_only === 'true') q = q.eq('status', 'open');
      if (auth.role === 'cashier') q = q.eq('user_id', auth.profile.id);
      const { data, error } = await q.limit(100);
      if (error) throw error;
      if (id) return res.status(200).json(data?.[0] || null);
      return res.status(200).json(data || []);
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const action = body.action || 'open';

      if (action === 'open') {
        const { data: existing } = await supabase
          .from('cashier_shifts')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('user_id', auth.profile.id)
          .eq('status', 'open')
          .maybeSingle();
        if (existing) return res.status(200).json(existing);

        const payload = {
          tenant_id: tenantId,
          branch_id: body.branch_id || auth.profile.branch_id || null,
          user_id: auth.profile.id,
          user_name: auth.profile.full_name || auth.profile.email,
          opening_float: Number(body.opening_float || 0),
          status: 'open',
          opened_at: new Date().toISOString(),
          notes: body.notes || null,
        };
        const { data, error } = await supabase.from('cashier_shifts').insert(payload).select().single();
        if (error) throw error;
        await writeAudit({
          tenantId,
          userId: auth.profile.id,
          action: 'shift.open',
          entity: 'cashier_shifts',
          entityId: data.id,
          meta: { opening_float: data.opening_float },
        });
        return res.status(201).json(data);
      }

      if (action === 'close') {
        const shiftId = body.id;
        if (!shiftId) return res.status(400).json({ error: 'id required' });
        const { data: shift } = await supabase.from('cashier_shifts').select('*').eq('id', shiftId).single();
        if (!shift) return res.status(404).json({ error: 'Shift not found' });
        if (Number(shift.tenant_id) !== Number(tenantId) && auth.role !== 'superadmin') {
          return res.status(403).json({ error: 'Forbidden' });
        }
        if (shift.status !== 'open') return res.status(400).json({ error: 'Shift already closed' });

        const openedAt = shift.opened_at;
        let salesQ = supabase
          .from('sales')
          .select('*')
          .eq('tenant_id', shift.tenant_id)
          .eq('status', 'completed')
          .gte('created_at', openedAt);
        if (shift.branch_id) salesQ = salesQ.eq('branch_id', shift.branch_id);
        const { data: sales } = await salesQ;
        const list = sales || [];

        const totals = {
          sales_count: list.length,
          sales_total: 0,
          cash_total: 0,
          card_total: 0,
          transfer_total: 0,
          credit_total: 0,
        };
        for (const s of list) {
          const total = Number(s.total || 0);
          const paid = Number(s.paid || 0);
          totals.sales_total += total;
          const m = String(s.payment_method || 'cash');
          if (m === 'cash' || m.startsWith('cash')) totals.cash_total += paid || total;
          else if (m === 'card' || m.startsWith('card')) totals.card_total += paid || total;
          else if (m.startsWith('transfer')) totals.transfer_total += paid || total;
          else if (m.startsWith('credit') || m === 'ajil') {
            totals.credit_total += Math.max(0, total - paid);
            totals.cash_total += paid;
          } else if (m.startsWith('split')) {
            const parts = m.replace('split:', '').split('/');
            totals.cash_total += Number(parts[0] || 0);
            totals.card_total += Number(parts[1] || 0);
          } else totals.cash_total += paid || total;
        }

        const closingCounted = Number(body.closing_counted ?? 0);
        const expectedCash = Number(shift.opening_float || 0) + totals.cash_total;
        const variance = closingCounted - expectedCash;

        const patch = {
          status: 'closed',
          closed_at: new Date().toISOString(),
          closing_counted: closingCounted,
          expected_cash: expectedCash,
          variance,
          sales_count: totals.sales_count,
          sales_total: totals.sales_total,
          cash_total: totals.cash_total,
          card_total: totals.card_total,
          transfer_total: totals.transfer_total,
          credit_total: totals.credit_total,
          notes: body.notes || shift.notes,
        };

        const { data, error } = await supabase
          .from('cashier_shifts')
          .update(patch)
          .eq('id', shiftId)
          .select()
          .single();
        if (error) throw error;

        await writeAudit({
          tenantId,
          userId: auth.profile.id,
          action: 'shift.close',
          entity: 'cashier_shifts',
          entityId: shiftId,
          meta: { variance, expectedCash, closingCounted },
        });

        return res.status(200).json(data);
      }

      return res.status(400).json({ error: 'Unknown action' });
    }

    return methodNotAllowed(res);
  },
  {
    permissions: {
      GET: 'shifts:read',
      POST: 'shifts:write',
    },
  }
);
