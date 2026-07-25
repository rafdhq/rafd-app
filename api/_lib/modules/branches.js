import { supabase } from '../db-client.js';
import { resolveAuth, assertPermission, resolveTenantId } from '../auth-middleware.js';
import { withApi } from '../handler.js';

const ONBOARDING_MAX_PER_HOUR = 10;

function clientIp(req) {
  const xff = req.headers['x-forwarded-for'] || req.headers['X-Forwarded-For'] || '';
  return String(xff).split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
}

// Fail open so a logging outage never prevents legitimate onboarding.
async function onboardingRateLimited(req) {
  try {
    const ip = clientIp(req);
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error } = await supabase
      .from('onboarding_ip_log')
      .select('id', { count: 'exact', head: true })
      .eq('ip', ip)
      .gte('created_at', since);
    if (error) return false;
    if ((count || 0) >= ONBOARDING_MAX_PER_HOUR) return true;
    await supabase.from('onboarding_ip_log').insert({ ip });
    return false;
  } catch {
    return false;
  }
}

export const handler = withApi(
  async function handler(req, res, { tenantId }) {
    try {
      if (req.method === 'GET') {
        const { id } = req.query;
        let q = supabase.from('branches').select('*').order('id', { ascending: true });
        if (tenantId) q = q.eq('tenant_id', tenantId);
        if (id) q = q.eq('id', id).eq('tenant_id', tenantId);
        const { data, error } = await q;
        if (error) throw error;
        return res.status(200).json(data);
      }

      if (req.method === 'POST') {
        const body = req.body || {};
        const requestedTenantId = Number(body.tenant_id);
        if (!Number.isFinite(requestedTenantId) || requestedTenantId <= 0) {
          return res.status(400).json({ error: 'tenant_id required' });
        }

        // Onboarding creates the first branch before an app_users profile exists.
        // Every subsequent branch requires normal authenticated tenant authorization.
        const auth = await resolveAuth(req);
        let effectiveTenantId;
        if (!auth.ok) {
          const { count, error } = await supabase
            .from('branches')
            .select('id', { count: 'exact', head: true })
            .eq('tenant_id', requestedTenantId);
          if (error) throw error;
          if ((count || 0) > 0) {
            return res.status(auth.status).json({ error: auth.error });
          }
          if (await onboardingRateLimited(req)) {
            return res.status(429).json({ error: 'Too many onboarding attempts. Please try again later.' });
          }
          effectiveTenantId = requestedTenantId;
        } else {
          const gate = assertPermission(auth, 'branches:write');
          if (!gate.ok) return res.status(gate.status).json({ error: gate.error });
          const tenant = resolveTenantId(req, auth, requestedTenantId);
          if (!tenant.ok) return res.status(tenant.status).json({ error: tenant.error });
          effectiveTenantId = tenant.tenantId;
        }

        const { data, error } = await supabase
          .from('branches')
          .insert({
            tenant_id: effectiveTenantId,
            name: body.name,
            name_ar: body.name_ar,
            address: body.address || null,
            phone: body.phone || null,
            is_main: !!body.is_main,
            status: body.status || 'active',
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
          .from('branches')
          .update(rest)
          .eq('id', id)
          .eq('tenant_id', tenantId)
          .select()
          .single();
        if (error) throw error;
        return res.status(200).json(data);
      }

      if (req.method === 'DELETE') {
        const { id } = req.body || {};
        if (!id) return res.status(400).json({ error: 'id required' });
        const { error } = await supabase.from('branches').delete().eq('id', id).eq('tenant_id', tenantId);
        if (error) throw error;
        return res.status(200).json({ ok: true });
      }

      return res.status(405).json({ error: 'Method not allowed' });
    } catch (err) {
      console.error('branches API error:', err);
      return res.status(500).json({ error: err.message });
    }
  },
  {
    permissions: { GET: 'branches:read', PUT: 'branches:write', DELETE: 'branches:write' },
    publicMethods: ['POST'],
  }
);
