import { supabase } from '../db-client.js';
import { withApi } from '../handler.js';

export const handler = withApi(
  async function handler(req, res, { auth, tenantId }) {
  try {
    if (req.method === 'GET') {

      let q = supabase.from('payment_terminals').select('*').order('id', { ascending: true });
      if (tenantId) q = q.eq('tenant_id', tenantId);
      const { data, error } = await q;
      if (error) throw error;
      return res.status(200).json(data || []);
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const { data, error } = await supabase
        .from('payment_terminals')
        .insert({
          tenant_id: tenantId,
          name: body.name,
          provider: body.provider || 'generic',
          terminal_id: body.terminal_id || null,
          connection_type: body.connection_type || 'manual',
          is_active: body.is_active !== false,
          supports_contactless: body.supports_contactless !== false,
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
      const { data, error } = await supabase
        .from('payment_terminals')
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
      const { error } = await supabase.from('payment_terminals').delete().eq('id', id).eq('tenant_id', tenantId);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('payment-terminals API error:', err);
    res.status(500).json({ error: err.message });
  }
  },
  { permissions: { GET: 'bank_accounts:read', POST: 'bank_accounts:write', PUT: 'bank_accounts:write', DELETE: 'bank_accounts:write' } }
);
