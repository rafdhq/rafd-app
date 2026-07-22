import supabase from '../db-client.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const { tenant_id } = req.query;
      let q = supabase.from('notifications').select('*').order('created_at', { ascending: false });
      if (tenant_id) q = q.eq('tenant_id', tenant_id);
      const { data, error } = await q.limit(50);
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const { data, error } = await supabase
        .from('notifications')
        .insert({
          tenant_id: body.tenant_id || null,
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
      const { id, mark_all, tenant_id, ...rest } = req.body || {};
      if (mark_all && tenant_id) {
        const { data, error } = await supabase
          .from('notifications')
          .update({ is_read: true })
          .eq('tenant_id', tenant_id)
          .select();
        if (error) throw error;
        return res.status(200).json(data);
      }
      if (!id) return res.status(400).json({ error: 'id required' });
      const { data, error } = await supabase.from('notifications').update(rest).eq('id', id).select().single();
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      const { error } = await supabase.from('notifications').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('notifications API error:', err);
    res.status(500).json({ error: err.message });
  }
}
