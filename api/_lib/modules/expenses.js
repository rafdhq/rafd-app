import { supabase } from '../db-client.js';
import { withApi } from '../handler.js';

export const handler = withApi(
  async function handler(req, res, { auth, tenantId }) {
  try {
    if (req.method === 'GET') {

      let q = supabase.from('expenses').select('*').order('expense_date', { ascending: false });
      if (tenantId) q = q.eq('tenant_id', tenantId);
      const { data, error } = await q;
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const { data, error } = await supabase
        .from('expenses')
        .insert({
          tenant_id: tenantId,
          category: body.category,
          amount: body.amount,
          description: body.description || null,
          payment_method: body.payment_method || 'cash',
          expense_date: body.expense_date || new Date().toISOString().slice(0, 10),
        })
        .select()
        .single();
      if (error) throw error;
      return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
      const { id, ...rest } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      const { data, error } = await supabase.from('expenses').update(rest).eq('id', id).eq('tenant_id', tenantId).select().single();
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      const { error } = await supabase.from('expenses').delete().eq('id', id).eq('tenant_id', tenantId);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('expenses API error:', err);
    res.status(500).json({ error: err.message });
  }
  },
  { permissions: { GET: 'expenses:read', POST: 'expenses:write', PUT: 'expenses:write', DELETE: 'expenses:write' } }
);
