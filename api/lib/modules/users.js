import { supabase } from '../db-client';
import { setCors, requireAuth, resolveTenantId, hasPermission } from '../auth-middleware';

export const handler = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const { tenant_id, email, id, role, me } = req.query;

      // Bootstrap profile by email — requires matching JWT email when token present
      if (email) {
        const auth = await requireAuth(req, res, {});
        // requireAuth already sent response if failed
        if (!auth) return;
        if (auth.user.email?.toLowerCase() !== String(email).toLowerCase() && auth.role !== 'superadmin') {
          return res.status(403).json({ error: 'Forbidden: email mismatch' });
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
      const body = req.body || {};
      if (!body.email) return res.status(400).json({ error: 'email required' });

      const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      let auth = null;
      if (token) {
        auth = await requireAuth(req, res, {});
        if (!auth) return;
      }

      // Prevent privilege escalation: only superadmin/owner can set elevated roles
      let role = body.role || 'cashier';
      if (auth) {
        if (!hasPermission(auth.role, 'users:write') && auth.user.email?.toLowerCase() !== String(body.email).toLowerCase()) {
          return res.status(403).json({ error: 'Forbidden' });
        }
        if (auth.role !== 'superadmin' && auth.role !== 'owner' && auth.role !== 'manager') {
          role = 'cashier';
        }
        if (role === 'superadmin' && auth.role !== 'superadmin') role = 'cashier';
      } else {
        // unauthenticated self-signup → owner only if creating new tenant flow
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
      if (error) throw error;
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
