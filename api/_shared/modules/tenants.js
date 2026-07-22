import supabase from '../db-client.js';

function parseArr(v) {
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  if (typeof v === 'string' && v.trim()) {
    try {
      const p = JSON.parse(v);
      return Array.isArray(p) ? p.map(String).filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return [];
}

async function getCatalog(tenantId) {
  const { data } = await supabase
    .from('tenant_catalog')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (!data) {
    return {
      business_type: 'grocery',
      enabled_categories: [],
      custom_categories: [],
    };
  }
  return {
    business_type: data.business_type || 'grocery',
    enabled_categories: parseArr(data.enabled_categories),
    custom_categories: parseArr(data.custom_categories),
  };
}

async function upsertCatalog(tenantId, body) {
  if (
    body.business_type == null &&
    body.enabled_categories == null &&
    body.custom_categories == null
  ) {
    return getCatalog(tenantId);
  }
  const current = await getCatalog(tenantId);
  const payload = {
    tenant_id: tenantId,
    business_type: body.business_type ?? current.business_type ?? 'grocery',
    enabled_categories: JSON.stringify(
      body.enabled_categories != null ? parseArr(body.enabled_categories) : current.enabled_categories
    ),
    custom_categories: JSON.stringify(
      body.custom_categories != null ? parseArr(body.custom_categories) : current.custom_categories
    ),
    updated_at: new Date().toISOString(),
  };
  const { data: existing } = await supabase
    .from('tenant_catalog')
    .select('id')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (existing?.id) {
    await supabase.from('tenant_catalog').update(payload).eq('id', existing.id);
  } else {
    await supabase.from('tenant_catalog').insert(payload);
  }
  return getCatalog(tenantId);
}

function stripCatalogFields(body) {
  const rest = { ...body };
  delete rest.business_type;
  delete rest.enabled_categories;
  delete rest.custom_categories;
  return rest;
}

async function withCatalog(row) {
  if (!row) return row;
  const catalog = await getCatalog(row.id);
  return { ...row, ...catalog };
}

export const handler = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const { id } = req.query;
      let q = supabase.from('tenants').select('*').order('id', { ascending: true });
      if (id) q = q.eq('id', id);
      const { data, error } = await q;
      if (error) throw error;
      if (id) return res.status(200).json(await withCatalog(data?.[0] || null));
      const rows = await Promise.all((data || []).map((r) => withCatalog(r)));
      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const tenantFields = stripCatalogFields(body);
      const { data, error } = await supabase
        .from('tenants')
        .insert({
          name: tenantFields.name,
          name_ar: tenantFields.name_ar,
          logo_url: tenantFields.logo_url || null,
          primary_color: tenantFields.primary_color || '#0d9488',
          secondary_color: tenantFields.secondary_color || '#d97706',
          currency: tenantFields.currency || 'YER',
          plan: tenantFields.plan || 'growth',
          status: tenantFields.status || 'trial',
          phone: tenantFields.phone || null,
          email: tenantFields.email || null,
          address: tenantFields.address || null,
          tax_number: tenantFields.tax_number || null,
          invoice_footer: tenantFields.invoice_footer || 'شكراً لتسوقكم معنا',
        })
        .select()
        .single();
      if (error) throw error;
      const catalog = await upsertCatalog(data.id, body);
      return res.status(201).json({ ...data, ...catalog });
    }

    if (req.method === 'PUT') {
      const body = req.body || {};
      const { id, ...rest } = body;
      if (!id) return res.status(400).json({ error: 'id required' });
      const tenantFields = stripCatalogFields(rest);
      let data = null;
      if (Object.keys(tenantFields).length) {
        const result = await supabase.from('tenants').update(tenantFields).eq('id', id).select().single();
        if (result.error) throw result.error;
        data = result.data;
      } else {
        const result = await supabase.from('tenants').select('*').eq('id', id).single();
        if (result.error) throw result.error;
        data = result.data;
      }
      const catalog = await upsertCatalog(id, body);
      return res.status(200).json({ ...data, ...catalog });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('tenants API error:', err);
    res.status(500).json({ error: err.message });
  }
}
