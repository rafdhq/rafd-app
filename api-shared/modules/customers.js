import { supabase } from '../db-client';
import { withApi } from '../handler';

export const handler = withApi(
  async function handler(req, res, { auth, tenantId }) {
    if (req.method === 'GET') {
      const { q } = req.query;
      let query = supabase.from('customers').select('*').order('name', { ascending: true });
      if (tenantId) query = query.eq('tenant_id', tenantId);
      const { data, error } = await query;
      if (error) throw error;
      let rows = data || [];
      if (q) {
        const s = String(q).toLowerCase();
        rows = rows.filter(
          (c) =>
            c.name?.toLowerCase().includes(s) ||
            c.phone?.includes(String(q)) ||
            c.email?.toLowerCase().includes(s)
        );
      }
      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const { data, error } = await supabase
        .from('customers')
        .insert({
          tenant_id: tenantId || body.tenant_id,
          name: body.name,
          phone: body.phone || null,
          email: body.email || null,
          balance: body.balance ?? 0,
          total_purchases: body.total_purchases ?? 0,
          notes: body.notes || null,
        })
        .select()
        .single();
      if (error) throw error;
      return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
      const { id, ...rest } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      delete rest.tenant_id;
      let q = supabase.from('customers').update(rest).eq('id', id);
      if (tenantId && auth.role !== 'superadmin') q = q.eq('tenant_id', tenantId);
      const { data, error } = await q.select().single();
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      if (auth.role === 'cashier') {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      let q = supabase.from('customers').delete().eq('id', id);
      if (tenantId && auth.role !== 'superadmin') q = q.eq('tenant_id', tenantId);
      const { error } = await q;
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  },
  {
    permissions: {
      GET: 'customers:read',
      POST: 'customers:write',
      PUT: 'customers:write',
      DELETE: 'customers:write',
    },
  }
);
