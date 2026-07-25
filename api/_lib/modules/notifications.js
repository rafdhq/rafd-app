import { supabase } from '../db-client.js';
import { withApi } from '../handler.js';

export const handler = withApi(
  async function handler(req, res, { auth, tenantId }) {
  try {
    if (req.method === 'GET') {

      let q = supabase.from('notifications').select('*').order('created_at', { ascending: false });
      if (tenantId) q = q.eq('tenant_id', tenantId);
      const { data, error } = await q.limit(50);
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const { data, error } = await supabase
        .from('notifications')
        .insert({
          tenant_id: tenantId || null,
          title: body.title,
          body: body.body,
          type: body.type || 'info',
          is_read: false,
        })
        .select()
        .single();
      if (error) throw error;
      return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
      const { id, mark_all, ...rest } = req.body || {};
      if (mark_all && tenantId) {
        const { data, error } = await supabase
          .from('notifications')
          .update({ is_read: true })
          .eq('tenant_id', tenantId)
          .select();
        if (error) throw error;
        return res.status(200).json(data);
      }
      if (!id) return res.status(400).json({ error: 'id required' });
      const { data, error } = await supabase.from('notifications').update(rest).eq('id', id).eq('tenant_id', tenantId).select().single();
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      const { error } = await supabase.from('notifications').delete().eq('id', id).eq('tenant_id', tenantId);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('notifications API error:', err);
    res.status(500).json({ error: err.message });
  }
  },
  { permissions: { GET: 'notifications:read', POST: 'notifications:write', PUT: 'notifications:write', DELETE: 'notifications:write' } }
);
