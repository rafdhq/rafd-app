import supabase from '../db-client.js';
import { withApi } from '../handler.js';
import { methodNotAllowed, setCors, requireAuth } from '../auth-middleware.js';

function token() {
  return `rafd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 8)}`;
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  // Public: inspect invite by token
  if (req.method === 'GET' && req.query?.token) {
    const { data, error } = await supabase
      .from('user_invites')
      .select('id, email, full_name, role, status, expires_at, tenant_id, created_at')
      .eq('token', req.query.token)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Invite not found' });
    if (data.status !== 'pending') return res.status(400).json({ error: 'Invite not pending', invite: data });
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Invite expired' });
    }
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id, name, name_ar')
      .eq('id', data.tenant_id)
      .maybeSingle();
    return res.status(200).json({ ...data, tenant });
  }

  // Accept invite: authenticated user, no role gate beyond being signed in
  if (req.method === 'POST' && (req.body?.action === 'accept' || req.query?.action === 'accept')) {
    const auth = await requireAuth(req, res, {});
    if (!auth) return;
    const invToken = req.body?.token;
    if (!invToken) return res.status(400).json({ error: 'token required' });
    const { data: invite } = await supabase.from('user_invites').select('*').eq('token', invToken).maybeSingle();
    if (!invite) return res.status(404).json({ error: 'Invite not found' });
    if (invite.status !== 'pending') return res.status(400).json({ error: 'Invite not pending' });
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Invite expired' });
    }

    const email = (auth.user.email || '').toLowerCase();
    if (email !== String(invite.email).toLowerCase()) {
      return res.status(403).json({ error: 'Invite email does not match signed-in user' });
    }

    const { data: existing } = await supabase.from('app_users').select('*').eq('email', email).maybeSingle();
    let profile = existing;
    if (!existing) {
      const { data: created, error } = await supabase
        .from('app_users')
        .insert({
          tenant_id: invite.tenant_id,
          auth_id: auth.user.id,
          email,
          full_name: invite.full_name || email.split('@')[0],
          role: invite.role,
          phone: invite.phone || null,
          status: 'active',
        })
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message });
      profile = created;
    } else {
      const { data: updated, error } = await supabase
        .from('app_users')
        .update({
          tenant_id: invite.tenant_id,
          role: invite.role,
          auth_id: auth.user.id,
          status: 'active',
          full_name: existing.full_name || invite.full_name,
        })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message });
      profile = updated;
    }

    await supabase
      .from('user_invites')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('id', invite.id);

    return res.status(200).json({ ok: true, profile });
  }

  return withApi(
    async function inner(req2, res2, { auth, tenantId }) {
      if (req2.method === 'GET') {
        let q = supabase.from('user_invites').select('*').order('created_at', { ascending: false });
        if (tenantId) q = q.eq('tenant_id', tenantId);
        const { data, error } = await q.limit(100);
        if (error) throw error;
        return res2.status(200).json(data || []);
      }

      if (req2.method === 'POST') {
        const body = req2.body || {};
        const action = body.action || 'create';

        if (action === 'create') {
          if (!body.email || !body.role) return res2.status(400).json({ error: 'email and role required' });
          const t = token();
          const expires = new Date();
          expires.setDate(expires.getDate() + 7);
          const { data, error } = await supabase
            .from('user_invites')
            .insert({
              tenant_id: tenantId,
              email: String(body.email).toLowerCase().trim(),
              full_name: body.full_name || null,
              role: body.role,
              phone: body.phone || null,
              token: t,
              status: 'pending',
              invited_by: auth.profile.id,
              invited_by_name: auth.profile.full_name || auth.profile.email,
              expires_at: expires.toISOString(),
            })
            .select()
            .single();
          if (error) throw error;

          await supabase.from('audit_logs').insert({
            tenant_id: tenantId,
            user_id: auth.profile.id,
            action: 'user.invite',
            entity_type: 'user_invites',
            entity_id: String(data.id),
            meta: { email: data.email, role: data.role },
          });

          await supabase.from('notifications').insert({
            tenant_id: tenantId,
            title: 'دعوة مستخدم جديدة',
            body: `تمت دعوة ${data.email} بدور ${data.role}`,
            type: 'info',
            is_read: false,
          });

          return res2.status(201).json(data);
        }

        if (action === 'revoke') {
          const id = body.id;
          if (!id) return res2.status(400).json({ error: 'id required' });
          const { data, error } = await supabase
            .from('user_invites')
            .update({ status: 'revoked' })
            .eq('id', id)
            .eq('tenant_id', tenantId)
            .select()
            .single();
          if (error) throw error;
          return res2.status(200).json(data);
        }

        return res2.status(400).json({ error: 'Unknown action' });
      }

      return methodNotAllowed(res2);
    },
    {
      permissions: {
        GET: 'users:read',
        POST: 'users:invite',
      },
    }
  )(req, res);
}
