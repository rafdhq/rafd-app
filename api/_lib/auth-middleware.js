import { createClient } from '@supabase/supabase-js';
import { supabase } from './db-client.js';
import { hasPermission, ROLE_PERMISSIONS } from './permissions.js';

export { hasPermission, ROLE_PERMISSIONS };

/**
 * Production authz for RAFD API routes.
 * - Verifies Supabase JWT
 * - Loads app_users profile
 * - Enforces tenant isolation + role permissions
 */

export function setCors(res, methods = 'GET, POST, PUT, DELETE, OPTIONS') {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Tenant-Id, X-Client-Offline, X-Idempotency-Key'
  );
}

export function getBearerToken(req) {
  const h = req.headers.authorization || req.headers.Authorization || '';
  if (typeof h === 'string' && h.startsWith('Bearer ')) return h.slice(7).trim();
  return null;
}

export async function resolveAuth(req) {
  const token = getBearerToken(req);
  if (!token) {
    return { ok: false, status: 401, error: 'Unauthorized: missing bearer token' };
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    return { ok: false, status: 401, error: 'Unauthorized: invalid token' };
  }

  const user = data.user;
  const email = user.email || '';

  let profile = null;
  if (email) {
    const { data: rows } = await supabase
      .from('app_users')
      .select('*')
      .eq('email', String(email).toLowerCase())
      .order('id', { ascending: true })
      .limit(1);
    profile = rows?.[0] || null;
  }

  if (!profile && user.id) {
    const { data: byAuth } = await supabase
      .from('app_users')
      .select('*')
      .eq('auth_id', user.id)
      .limit(1);
    profile = byAuth?.[0] || null;
  }

  if (!profile) {
    return {
      ok: false,
      status: 403,
      error: 'Forbidden: no app profile linked to this account',
      user,
    };
  }

  if (profile.status && profile.status !== 'active') {
    return { ok: false, status: 403, error: 'Forbidden: user account is not active', user, profile };
  }

  return { ok: true, user, profile, token, role: profile.role || 'cashier' };
}

export function assertPermission(auth, permission) {
  if (!auth?.ok) return { ok: false, status: auth?.status || 401, error: auth?.error || 'Unauthorized' };
  if (!hasPermission(auth.role, permission)) {
    return {
      ok: false,
      status: 403,
      error: `Forbidden: role '${auth.role}' cannot perform '${permission}'`,
    };
  }
  return { ok: true };
}

/**
 * Resolve effective tenant_id for the request.
 * Non-superadmin cannot escalate to another tenant.
 */
export function resolveTenantId(req, auth, bodyTenantId) {
  const q = req.query || {};
  const headerTenant = req.headers['x-tenant-id'] || req.headers['X-Tenant-Id'];
  const requested = Number(
    bodyTenantId ?? q.tenant_id ?? headerTenant ?? auth.profile?.tenant_id ?? NaN
  );

  if (auth.role === 'superadmin') {
    if (Number.isFinite(requested) && requested > 0) return { ok: true, tenantId: requested };
    return { ok: true, tenantId: auth.profile?.tenant_id ?? null, isPlatform: true };
  }

  const own = Number(auth.profile?.tenant_id);
  if (!Number.isFinite(own) || own <= 0) {
    return { ok: false, status: 403, error: 'Forbidden: user has no tenant' };
  }

  if (Number.isFinite(requested) && requested > 0 && requested !== own) {
    return { ok: false, status: 403, error: 'Forbidden: tenant isolation violation' };
  }

  return { ok: true, tenantId: own };
}

export async function requireAuth(req, res, { permission, allowPlatform = false } = {}) {
  const auth = await resolveAuth(req);
  if (!auth.ok) {
    res.status(auth.status).json({ error: auth.error });
    return null;
  }

  if (permission) {
    const gate = assertPermission(auth, permission);
    if (!gate.ok) {
      res.status(gate.status).json({ error: gate.error });
      return null;
    }
  }

  if (!allowPlatform && auth.role === 'superadmin' && permission && !String(permission).startsWith('platform')) {
    // superadmin may access tenant APIs when tenant_id provided
  }

  return auth;
}

/** User-scoped Supabase client (respects RLS when policies use auth.uid()) */
export function createUserClient(token) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    console.error(
      `[RAFD AUTH-MIDDLEWARE ENV ERROR] Missing ${!url ? 'NEXT_PUBLIC_SUPABASE_URL' : ''}${!url && !anonKey ? ' and ' : ''}${!anonKey ? 'NEXT_PUBLIC_SUPABASE_ANON_KEY (or VITE_SUPABASE_ANON_KEY)' : ''}. ` +
      `User-scoped client needed for RLS. Check GitHub Secrets/Variables and Vercel env. See .env.example`
    );
  }

  return createClient(
    url || '',
    anonKey || '',
    {
      global: {
        headers: { Authorization: `Bearer ${token}` },
      },
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
}

export async function requirePlatformAdmin(req, res) {
  const auth = await resolveAuth(req);
  if (!auth.ok) {
    res.status(auth.status).json({ error: auth.error });
    return null;
  }
  if (auth.role !== 'superadmin') {
    res.status(403).json({ error: 'Forbidden: platform admin (superadmin) only' });
    return null;
  }
  return auth;
}

export function methodNotAllowed(res) {
  return res.status(405).json({ error: 'Method not allowed' });
}
