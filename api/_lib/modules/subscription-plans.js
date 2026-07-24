import { supabase } from '../db-client.js';
import { requirePlatformAdmin } from '../auth-middleware.js';

/**
 * Whitelist of columns that actually exist on subscription_plans (see
 * migrations 20260722000001 + 20260722000013). Building payloads from this list
 * prevents PostgREST "column does not exist" failures if the client ever sends
 * an unexpected field — the exact class of bug that broke Platform Admin edits.
 */
function buildPlanPayload(body, { partial = false } = {}) {
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);
  const features = Array.isArray(body.features)
    ? body.features
    : typeof body.features === 'string' && body.features.trim()
      ? body.features.split('\n').map((x) => x.trim()).filter(Boolean)
      : [];
  const full = {
    code: body.code,
    name: body.name,
    name_ar: body.name_ar,
    name_en: body.name_en,
    description: body.description ?? null,
    price_monthly: body.price_monthly ?? 0,
    price_yearly: body.price_yearly ?? 0,
    currency: body.currency || 'YER',
    trial_days: body.trial_days ?? 14,
    max_branches: body.max_branches ?? 1,
    max_users: body.max_users ?? 5,
    max_products: body.max_products ?? 1000,
    features,
    is_popular: !!body.is_popular,
    is_active: body.is_active !== false,
    sort_order: body.sort_order ?? 0,
  };
  if (!partial) {
    return Object.fromEntries(Object.entries(full).filter(([, v]) => v !== undefined));
  }
  // Partial update: only the whitelisted fields the client actually sent, so we
  // never null-out unrelated columns on a sparse PATCH-like PUT.
  const patch = {};
  for (const key of Object.keys(full)) {
    if (has(key)) patch[key] = full[key];
  }
  return patch;
}

export const handler = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const { active } = req.query;
      let q = supabase.from('subscription_plans').select('*').order('sort_order', { ascending: true });
      if (active === '1' || active === 'true') q = q.eq('is_active', true);
      const { data, error } = await q;
      if (error) throw error;
      return res.status(200).json(data || []);
    }

    // Mutations below require an authenticated superadmin (Platform Admin).
    const auth = await requirePlatformAdmin(req, res);
    if (!auth) return;

    if (req.method === 'POST') {
      const body = req.body || {};
      const payload = buildPlanPayload(body);
      if (!payload.code) payload.code = `plan_${Date.now()}`;
      if (!payload.name) payload.name = payload.name_ar || payload.code;
      if (!payload.name_ar) payload.name_ar = payload.name;
      const { data, error } = await supabase
        .from('subscription_plans')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
      const body = req.body || {};
      const { id } = body;
      if (!id) return res.status(400).json({ error: 'id required' });
      // Partial update: only the whitelisted fields the client sent.
      const patch = buildPlanPayload(body, { partial: true });
      const { data, error } = await supabase
        .from('subscription_plans')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      const { error } = await supabase.from('subscription_plans').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('subscription-plans API error:', err);
    res.status(500).json({ error: err.message });
  }
}
