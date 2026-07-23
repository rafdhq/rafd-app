import { supabase } from '../db-client';

export const handler = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const { tenant_id, customer_id } = req.query;
      let q = supabase.from('customer_ledger').select('*').order('created_at', { ascending: false });
      if (tenant_id) q = q.eq('tenant_id', tenant_id);
      if (customer_id) q = q.eq('customer_id', customer_id);
      const { data, error } = await q;
      if (error) throw error;
      return res.status(200).json(data || []);
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const customerId = body.customer_id;
      const amount = Number(body.amount || 0);
      const type = body.type || 'payment'; // sale_credit | payment | adjustment

      if (!customerId || !amount) {
        return res.status(400).json({ error: 'customer_id and amount required' });
      }

      const { data: customer, error: cErr } = await supabase
        .from('customers')
        .select('*')
        .eq('id', customerId)
        .single();
      if (cErr) throw cErr;

      let balance = Number(customer.balance || 0);
      // sale_credit increases what customer owes; payment decreases it
      if (type === 'sale_credit' || type === 'debit') balance += amount;
      else if (type === 'payment' || type === 'credit') balance = Math.max(0, balance - amount);
      else if (type === 'adjustment') balance = amount;

      const { error: uErr } = await supabase
        .from('customers')
        .update({ balance })
        .eq('id', customerId);
      if (uErr) throw uErr;

      const { data, error } = await supabase
        .from('customer_ledger')
        .insert({
          tenant_id: body.tenant_id || customer.tenant_id,
          customer_id: customerId,
          type,
          amount,
          balance_after: balance,
          reference: body.reference || null,
          notes: body.notes || null,
          sale_id: body.sale_id || null,
        })
        .select()
        .single();
      if (error) throw error;
      return res.status(201).json(data);
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('customer-ledger API error:', err);
    res.status(500).json({ error: err.message });
  }
}
