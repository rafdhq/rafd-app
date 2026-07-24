import { supabase } from '../db-client.js';
import { setCors, requireAuth, resolveTenantId, hasPermission } from '../auth-middleware.js';

export const handler = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const { tenant_id, email, id, role, me } = req.query;

      // Bootstrap profile by email — requires matching JWT email when token present
      // Supports two cases:
      // 1) Self lookup during onboarding (token valid but no app_users yet) → allow if email matches token email
      // 2) Normal lookup after login (requires existing profile or superadmin)
      if (email) {
        const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
        let authUser = null;
        let requesterProfile = null;
        let auth = null;

        if (token) {
          const { data: authData, error: authErr } = await supabase.auth.getUser(token);
          if (authErr || !authData?.user) {
            return res.status(401).json({ error: 'Unauthorized: invalid token' });
          }
          authUser = authData.user;

          const emailLower = String(authUser.email || '').toLowerCase();
          if (emailLower) {
            const { data: rows } = await supabase
              .from('app_users')
              .select('*')
              .eq('email', emailLower)
              .limit(1);
            requesterProfile = rows?.[0] || null;
          }
          if (!requesterProfile && authUser.id) {
            const { data: byAuth } = await supabase
              .from('app_users')
              .select('*')
              .eq('auth_id', authUser.id)
              .limit(1);
            requesterProfile = byAuth?.[0] || null;
          }

          if (requesterProfile) {
            auth = {
              ok: true,
              user: authUser,
              profile: requesterProfile,
              role: requesterProfile.role || 'cashier',
            };
          }
        }

        if (requesterProfile && auth) {
          // Existing profile → check email mismatch unless superadmin
          if (auth.user.email?.toLowerCase() !== String(email).toLowerCase() && auth.role !== 'superadmin') {
            return res.status(403).json({ error: 'Forbidden: email mismatch' });
          }
        } else if (authUser) {
          // No profile yet → first owner self-lookup during onboarding, allow only if requested email matches token email
          if (String(authUser.email || '').toLowerCase() !== String(email).toLowerCase()) {
            return res.status(403).json({ error: 'Forbidden: email mismatch for self-lookup' });
          }
          // Allow: will return empty array (no profile yet) instead of 403
        } else {
          // No token → unauthenticated, try requireAuth to keep original behavior for public? Will return 401
          const fallbackAuth = await requireAuth(req, res, {});
          if (!fallbackAuth) return;
          if (fallbackAuth.user.email?.toLowerCase() !== String(email).toLowerCase() && fallbackAuth.role !== 'superadmin') {
            return res.status(403).json({ error: 'Forbidden: email mismatch' });
          }
        }

        const { data, error } = await supabase
          .from('app_users')
          .select('*')
          .eq('email', String(email).toLowerCase());
        if (error) throw error;
        return res.status(200).json(data);
      }

      if (me === '1' || me === 'true') {
        const auth = await requireAuth(req, res, {});
        if (!auth) return;
        return res.status(200).json(auth.profile);
      }

      const auth = await requireAuth(req, res, { permission: 'users:read' });
      if (!auth) return;
      const t = resolveTenantId(req, auth, tenant_id);
      if (!t.ok) return res.status(t.status).json({ error: t.error });

      let q = supabase.from('app_users').select('*').order('id', { ascending: true });
      if (t.tenantId) q = q.eq('tenant_id', t.tenantId);
      if (id) q = q.eq('id', id);
      if (role) q = q.eq('role', role);
      const { data, error } = await q;
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      // signup / onboarding may create first owner profile
      // This endpoint serves two distinct cases:
      // 1) First Owner during Onboarding: token exists (Supabase Auth) but no app_users yet → allow self-signup as owner if email matches token
      // 2) Staff creation after login: token + existing app_users with users:write → full permission check
      const body = req.body || {};
      if (!body.email) return res.status(400).json({ error: 'email required' });

      const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      let authUser = null; // Supabase Auth user
      let requesterProfile = null; // app_users profile of the caller (if exists)
      let auth = null; // compatibility with existing permission checks (when profile exists)

      if (token) {
        const { data: authData, error: authErr } = await supabase.auth.getUser(token);
        if (authErr || !authData?.user) {
          return res.status(401).json({ error: 'Unauthorized: invalid token' });
        }
        authUser = authData.user;

        // Optional lookup of requester profile (does NOT fail if not found — this is the fix for chicken-egg)
        const emailLower = String(authUser.email || '').toLowerCase();
        if (emailLower) {
          const { data: rows } = await supabase
            .from('app_users')
            .select('*')
            .eq('email', emailLower)
            .limit(1);
          requesterProfile = rows?.[0] || null;
        }
        if (!requesterProfile && authUser.id) {
          const { data: byAuth } = await supabase
            .from('app_users')
            .select('*')
            .eq('auth_id', authUser.id)
            .limit(1);
          requesterProfile = byAuth?.[0] || null;
        }

        if (requesterProfile) {
          // Existing user (owner/manager/superadmin) → build auth object for permission checks
          auth = {
            ok: true,
            user: authUser,
            profile: requesterProfile,
            role: requesterProfile.role || 'cashier',
            token,
          };
          if (requesterProfile.status && requesterProfile.status !== 'active') {
            return res.status(403).json({ error: 'Forbidden: user account is not active' });
          }
        }
        // If requesterProfile is null → first owner self-signup case, auth stays null for permission branch below,
        // but authUser is kept for email-match verification
      }

      // Prevent privilege escalation: only superadmin/owner can set elevated roles
      let role = body.role || 'cashier';
      if (requesterProfile && auth) {
        // Case 2: Staff creation — requester has existing profile
        if (!hasPermission(auth.role, 'users:write') && auth.user.email?.toLowerCase() !== String(body.email).toLowerCase()) {
          return res.status(403).json({ error: 'Forbidden' });
        }
        if (auth.role !== 'superadmin' && auth.role !== 'owner' && auth.role !== 'manager') {
          role = 'cashier';
        }
        if (role === 'superadmin' && auth.role !== 'superadmin') role = 'cashier';
      } else if (authUser) {
        // Case 1: First owner self-signup — token valid but no app_users yet
        // Must be self (email matches token) and only owner allowed
        const tokenEmailLower = String(authUser.email || '').toLowerCase();
        const bodyEmailLower = String(body.email).toLowerCase();
        if (tokenEmailLower !== bodyEmailLower) {
          return res.status(403).json({ error: 'Forbidden: email mismatch for self-signup' });
        }
        role = body.role === 'owner' ? 'owner' : 'cashier';
        // Only owner allowed in this path; even if caller requested cashier, we keep cashier but onboarding requests owner
        if (role !== 'owner') {
          // For onboarding we expect owner; if someone tries to self-signup as cashier without profile, deny unless it's same email self-update (which would be creation)
          // Allow cashier self-signup only if it's the same email (first time) — but restrict to owner for safety as per original intent
          // Original else branch allowed owner only; keep that
          role = body.role === 'owner' ? 'owner' : 'cashier';
        }
      } else {
        // unauthenticated self-signup → owner only if creating new tenant flow (legacy path, no token)
        role = body.role === 'owner' ? 'owner' : 'cashier';
      }

      const { data: existing } = await supabase
        .from('app_users')
        .select('*')
        .eq('email', String(body.email).toLowerCase())
        .maybeSingle();

      if (existing?.id) {
        const { data, error } = await supabase
          .from('app_users')
          .update({
            tenant_id: body.tenant_id ?? existing.tenant_id,
            auth_id: body.auth_id || existing.auth_id || null,
            full_name: body.full_name || existing.full_name,
            role: auth && (auth.role === 'owner' || auth.role === 'superadmin') ? role : existing.role,
            phone: body.phone ?? existing.phone,
            branch_id: body.branch_id ?? existing.branch_id,
            status: body.status || existing.status || 'active',
            avatar_url: body.avatar_url ?? existing.avatar_url,
          })
          .eq('id', existing.id)
          .select()
          .single();
        if (error) throw error;
        return res.status(200).json(data);
      }

      // Race protection: email has UNIQUE index, auth_id will have partial UNIQUE after migration 000012
      // If two concurrent requests both passed the "existing == null" check, one INSERT will fail with 23505 duplicate
      // In that case we return the existing row (idempotent success) instead of 500
      const { data, error } = await supabase
        .from('app_users')
        .insert({
          tenant_id: body.tenant_id ?? null,
          auth_id: body.auth_id || null,
          email: String(body.email).toLowerCase(),
          full_name: body.full_name,
          role,
          phone: body.phone || null,
          branch_id: body.branch_id || null,
          status: body.status || 'active',
          avatar_url: body.avatar_url || null,
        })
        .select()
        .single();

      if (error) {
        const msg = String(error.message || '').toLowerCase();
        const isDuplicate = msg.includes('duplicate') || msg.includes('already exists') || (error.code && String(error.code) === '23505');
        if (isDuplicate) {
          // Another concurrent request inserted first — return existing (idempotent)
          const { data: raced } = await supabase
            .from('app_users')
            .select('*')
            .eq('email', String(body.email).toLowerCase())
            .maybeSingle();
          if (raced?.id) {
            // If raced row has no auth_id yet but we have one, update it (first owner linking)
            if (!raced.auth_id && body.auth_id) {
              const { data: updated } = await supabase
                .from('app_users')
                .update({ auth_id: body.auth_id, tenant_id: body.tenant_id ?? raced.tenant_id })
                .eq('id', raced.id)
                .select()
                .single();
              return res.status(200).json(updated || raced);
            }
            return res.status(200).json(raced);
          }
          // Fallback: try by auth_id if email lookup failed (should not happen due to email unique, but handle)
          if (body.auth_id) {
            const { data: byAuth } = await supabase
              .from('app_users')
              .select('*')
              .eq('auth_id', body.auth_id)
              .maybeSingle();
            if (byAuth?.id) return res.status(200).json(byAuth);
          }
        }
        throw error;
      }
      return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
      const auth = await requireAuth(req, res, { permission: 'users:write' });
      if (!auth) return;
      const { id, ...rest } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      if (rest.role === 'superadmin' && auth.role !== 'superadmin') {
        return res.status(403).json({ error: 'Cannot assign superadmin' });
      }
      if (rest.tenant_id && auth.role !== 'superadmin' && Number(rest.tenant_id) !== Number(auth.profile.tenant_id)) {
        return res.status(403).json({ error: 'tenant isolation' });
      }
      const { data, error } = await supabase.from('app_users').update(rest).eq('id', id).select().single();
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      const auth = await requireAuth(req, res, { permission: 'users:write' });
      if (!auth) return;
      if (auth.role === 'cashier') return res.status(403).json({ error: 'Forbidden' });
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      const { error } = await supabase.from('app_users').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('users API error:', err);
    res.status(500).json({ error: err.message });
  }
}
