import { supabase } from '../db-client.js';
import { resolveAuth, assertPermission } from '../auth-middleware.js';

/** Requests-per-IP allowed against the public onboarding POST within the window. */
const ONBOARDING_MAX_PER_HOUR = 10;

function clientIp(req) {
  const xff = req.headers['x-forwarded-for'] || req.headers['X-Forwarded-For'] || '';
  const first = String(xff).split(',')[0].trim();
  return first || req.socket?.remoteAddress || 'unknown';
}

/**
 * Best-effort, DB-backed rate limit for the PUBLIC store-creation endpoint
 * (BL-01). Onboarding creates a tenant before any user/token exists, so POST
 * must stay open — but it is defended here (and by device-trial binding at
 * /api/subscription `init-trial`, which rejects repeat free trials).
 *
 * Fail-open: any infrastructure error (e.g. the log table not yet migrated)
 * allows the request, so store creation is never broken by this control.
 */
async function onboardingRateLimited(req) {
  try {
    const ip = clientIp(req);
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error } = await supabase
      .from('onboarding_ip_log')
      .select('id', { count: 'exact', head: true })
      .eq('ip', ip)
      .gte('created_at', since);
    if (error) return false; // fail-open
    if ((count || 0) >= ONBOARDING_MAX_PER_HOUR) return true;
    await supabase.from('onboarding_ip_log').insert({ ip });
    return false;
  } catch {
    return false; // fail-open
  }
}

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
    // BL-01: GET/PUT require authentication + tenant isolation. Only POST stays
    // public (onboarding creates the store before a user/token exists).
    if (req.method === 'GET' || req.method === 'PUT') {
      const auth = await resolveAuth(req);
      if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
      const isSuper = auth.role === 'superadmin';
      const ownTenant = Number(auth.profile?.tenant_id);

      if (req.method === 'GET') {
        const { id } = req.query;
        if (id != null && id !== '') {
          if (!isSuper && Number(id) !== ownTenant) {
            return res.status(403).json({ error: 'Forbidden' });
          }
          const { data, error } = await supabase.from('tenants').select('*').eq('id', id);
          if (error) throw error;
          return res.status(200).json(await withCatalog(data?.[0] || null));
        }
        // List: superadmin sees every tenant; a tenant user sees only their own.
        if (!isSuper) {
          if (!Number.isFinite(ownTenant) || ownTenant <= 0) return res.status(200).json([]);
          const { data, error } = await supabase.from('tenants').select('*').eq('id', ownTenant);
          if (error) throw error;
          const rows = await Promise.all((data || []).map((r) => withCatalog(r)));
          return res.status(200).json(rows);
        }
        const { data, error } = await supabase
          .from('tenants')
          .select('id, name, name_ar, email, phone, status, currency, created_at, updated_at, plan, logo_url, business_type, address, primary_color, secondary_color, invoice_footer, tenant_subscriptions!left(id, tenant_id, status, billing_cycle, trial_starts_at, trial_ends_at, subscription_starts_at, subscription_ends_at, amount, currency, notes, plan_code, updated_at, created_at), app_users!left(id, full_name, email, role, status, auth_id, tenant_id)')
          .order('id', { ascending: true });
        if (error) throw error;
        const rows = await Promise.all((data || []).map((r) => {
          const sub = (r.tenant_subscriptions || [])[0] || null;
          const user = (r.app_users || [])[0] || null;
          // subscription_plan info is fetched separately via sub.plan_code if needed; we keep it minimal
          const merged = { ...r, ...sub, owner: user };
          delete merged.tenant_subscriptions;
          delete merged.app_users;
          return withCatalog(merged);
        }));
        return res.status(200).json(rows);
      }

      // PUT — edit store settings; requires settings:write + own tenant.
      const gate = assertPermission(auth, 'settings:write');
      if (!gate.ok) return res.status(gate.status).json({ error: gate.error });
      const body = req.body || {};
      const { id, ...rest } = body;
      if (!id) return res.status(400).json({ error: 'id required' });
      if (!isSuper && Number(id) !== ownTenant) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const tenantFields = stripCatalogFields(rest);
      delete tenantFields.tenant_id;
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

    if (req.method === 'POST') {
      if (await onboardingRateLimited(req)) {
        return res.status(429).json({ error: 'Too many store-creation attempts. Please try again later.' });
      }
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

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('tenants API error:', err);
    res.status(500).json({ error: err.message });
  }
}
