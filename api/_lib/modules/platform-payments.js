import { supabase } from '../db-client.js';

export const handler = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const { active } = req.query;
      let q = supabase.from('platform_payment_methods').select('*').order('sort_order', { ascending: true });
      if (active === '1' || active === 'true') q = q.eq('is_active', true);
      const { data, error } = await q;
      if (error) throw error;
      return res.status(200).json(data || []);
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const { data, error } = await supabase
        .from('platform_payment_methods')
        .insert({
          name: body.name,
          name_ar: body.name_ar,
          type: body.type || 'bank',
          provider: body.provider || null,
          account_name: body.account_name || null,
          account_number: body.account_number || null,
          iban: body.iban || null,
          instructions: body.instructions || null,
          is_active: body.is_active !== false,
          sort_order: body.sort_order ?? 0,
        })
        .select()
        .single();
      if (error) throw error;
      return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
      const { id, ...rest } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      const { data, error } = await supabase
        .from('platform_payment_methods')
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
      const { error } = await supabase.from('platform_payment_methods').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('platform-payments API error:', err);
    res.status(500).json({ error: err.message });
  }
}
