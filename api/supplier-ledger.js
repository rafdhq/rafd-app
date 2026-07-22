import supabase from './db-client.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const { tenant_id, supplier_id } = req.query;
      let q = supabase.from('supplier_ledger').select('*').order('created_at', { ascending: false });
      if (tenant_id) q = q.eq('tenant_id', tenant_id);
      if (supplier_id) q = q.eq('supplier_id', supplier_id);
      const { data, error } = await q;
      if (error) throw error;
      return res.status(200).json(data || []);
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const supplierId = body.supplier_id;
      const amount = Number(body.amount || 0);
      const type = body.type || 'payment'; // purchase_credit | payment | adjustment

      if (!supplierId || amount < 0) {
        return res.status(400).json({ error: 'supplier_id and amount required' });
      }

      const { data: supplier, error: sErr } = await supabase
        .from('suppliers')
        .select('*')
        .eq('id', supplierId)
        .single();
      if (sErr) throw sErr;

      let balance = Number(supplier.balance || 0);
      // purchase_credit increases what we owe; payment decreases it
      if (type === 'purchase_credit' || type === 'debit') balance += amount;
      else if (type === 'payment' || type === 'credit') balance = Math.max(0, balance - amount);
      else if (type === 'adjustment') balance = amount;

      const { error: uErr } = await supabase
        .from('suppliers')
        .update({ balance })
        .eq('id', supplierId);
      if (uErr) throw uErr;

      const { data, error } = await supabase
        .from('supplier_ledger')
        .insert({
          tenant_id: body.tenant_id || supplier.tenant_id,
          supplier_id: supplierId,
          type,
          amount,
          balance_after: balance,
          reference: body.reference || null,
          notes: body.notes || null,
          purchase_id: body.purchase_id || null,
        })
        .select()
        .single();
      if (error) throw error;
      return res.status(201).json(data);
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('supplier-ledger API error:', err);
    res.status(500).json({ error: err.message });
  }
}
