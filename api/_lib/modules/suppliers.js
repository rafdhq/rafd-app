import { supabase } from '../db-client.js';
import { withApi } from '../handler.js';

export const handler = withApi(
  async function handler(req, res, { auth, tenantId }) {
  try {
    if (req.method === 'GET') {

      let q = supabase.from('suppliers').select('*').order('name', { ascending: true });
      if (tenantId) q = q.eq('tenant_id', tenantId);
      const { data, error } = await q;
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const { data, error } = await supabase
        .from('suppliers')
        .insert({
          tenant_id: tenantId,
          name: body.name,
          phone: body.phone || null,
          email: body.email || null,
          balance: body.balance ?? 0,
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
      const { data, error } = await supabase.from('suppliers').update(rest).eq('id', id).eq('tenant_id', tenantId).select().single();
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      const { error } = await supabase.from('suppliers').delete().eq('id', id).eq('tenant_id', tenantId);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('suppliers API error:', err);
    res.status(500).json({ error: err.message });
  }
  },
  { permissions: { GET: 'suppliers:read', POST: 'suppliers:write', PUT: 'suppliers:write', DELETE: 'suppliers:write' } }
);
