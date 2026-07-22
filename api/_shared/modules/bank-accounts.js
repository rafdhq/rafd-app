import supabase from '../db-client.js';

export const handler = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const { tenant_id } = req.query;
      let q = supabase.from('bank_accounts').select('*').order('id', { ascending: true });
      if (tenant_id) q = q.eq('tenant_id', tenant_id);
      const { data, error } = await q;
      if (error) throw error;
      return res.status(200).json(data || []);
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const { data, error } = await supabase
        .from('bank_accounts')
        .insert({
          tenant_id: body.tenant_id,
          bank_name: body.bank_name,
          account_name: body.account_name,
          account_number: body.account_number || null,
          iban: body.iban || null,
          currency: body.currency || 'YER',
          is_active: body.is_active !== false,
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
      const { data, error } = await supabase.from('bank_accounts').update(rest).eq('id', id).select().single();
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      const { error } = await supabase.from('bank_accounts').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('bank-accounts API error:', err);
    res.status(500).json({ error: err.message });
  }
}
