import { supabase } from '../db-client.js';
import { withApi } from '../handler.js';

export const handler = withApi(
  async function handler(req, res, { auth, tenantId }) {
  try {
    if (req.method === 'GET') {
      const { id } = req.query;
      let q = supabase.from('branches').select('*').order('id', { ascending: true });
      if (tenantId) q = q.eq('tenant_id', tenantId);
      if (id) q = q.eq('id', id).eq('tenant_id', tenantId);
      const { data, error } = await q;
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const { data, error } = await supabase
        .from('branches')
        .insert({
          tenant_id: tenantId,
          name: body.name,
          name_ar: body.name_ar,
          address: body.address || null,
          phone: body.phone || null,
          is_main: !!body.is_main,
          status: body.status || 'active',
        })
        .select()
        .single();
      if (error) throw error;
      return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
      const { id, ...rest } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      const { data, error } = await supabase.from('branches').update(rest).eq('id', id).eq('tenant_id', tenantId).select().single();
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      const { error } = await supabase.from('branches').delete().eq('id', id).eq('tenant_id', tenantId);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('branches API error:', err);
    res.status(500).json({ error: err.message });
  }
  },
  { permissions: { GET: 'branches:read', POST: 'branches:write', PUT: 'branches:write', DELETE: 'branches:write' } }
);
