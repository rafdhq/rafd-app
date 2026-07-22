import supabase from './db-client.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const { published } = req.query;
      let q = supabase.from('platform_announcements').select('*').order('created_at', { ascending: false });
      if (published === '1' || published === 'true') q = q.eq('is_published', true);
      const { data, error } = await q.limit(100);
      if (error) throw error;
      return res.status(200).json(data || []);
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const { data, error } = await supabase
        .from('platform_announcements')
        .insert({
          title: body.title,
          body: body.body,
          type: body.type || 'info',
          audience: body.audience || 'all',
          is_published: body.is_published !== false,
          publish_at: body.publish_at || new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw error;

      // Optionally push to tenant notifications when published
      if (data.is_published && body.push_to_tenants) {
        const { data: tenants } = await supabase.from('tenants').select('id');
        if (tenants?.length) {
          await supabase.from('notifications').insert(
            tenants.map((t) => ({
              tenant_id: t.id,
              title: data.title,
              body: data.body,
              type: data.type || 'info',
              is_read: false,
            }))
          );
        }
      }

      return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
      const { id, ...rest } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      const { data, error } = await supabase
        .from('platform_announcements')
        .update(rest)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      const { error } = await supabase.from('platform_announcements').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('platform-announcements API error:', err);
    res.status(500).json({ error: err.message });
  }
}
