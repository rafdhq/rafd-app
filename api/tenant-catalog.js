import supabase from './db-client.js';

function parseArr(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    try {
      const p = JSON.parse(v);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const { tenant_id } = req.query;
      if (!tenant_id) return res.status(400).json({ error: 'tenant_id required' });
      const { data, error } = await supabase
        .from('tenant_catalog')
        .select('*')
        .eq('tenant_id', tenant_id)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        return res.status(200).json({
          tenant_id: Number(tenant_id),
          business_type: 'grocery',
          enabled_categories: [],
          custom_categories: [],
        });
      }
      return res.status(200).json({
        ...data,
        enabled_categories: parseArr(data.enabled_categories),
        custom_categories: parseArr(data.custom_categories),
      });
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      const body = req.body || {};
      const tenant_id = body.tenant_id;
      if (!tenant_id) return res.status(400).json({ error: 'tenant_id required' });

      const payload = {
        tenant_id,
        business_type: body.business_type || 'grocery',
        enabled_categories: JSON.stringify(parseArr(body.enabled_categories)),
        custom_categories: JSON.stringify(parseArr(body.custom_categories)),
        updated_at: new Date().toISOString(),
      };

      const { data: existing } = await supabase
        .from('tenant_catalog')
        .select('id')
        .eq('tenant_id', tenant_id)
        .maybeSingle();

      let row;
      if (existing?.id) {
        const { data, error } = await supabase
          .from('tenant_catalog')
          .update(payload)
          .eq('id', existing.id)
          .select()
          .single();
        if (error) throw error;
        row = data;
      } else {
        const { data, error } = await supabase.from('tenant_catalog').insert(payload).select().single();
        if (error) throw error;
        row = data;
      }

      return res.status(200).json({
        ...row,
        enabled_categories: parseArr(row.enabled_categories),
        custom_categories: parseArr(row.custom_categories),
      });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('tenant-catalog API error:', err);
    res.status(500).json({ error: err.message });
  }
}
