import { supabase } from '../db-client.js';
import { withApi } from '../handler.js';
import { methodNotAllowed } from '../auth-middleware.js';

/**
 * Web Push subscription storage + fan-out.
 * Actual browser push requires VAPID keys (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY).
 * When keys are missing we still store subscriptions and create in-app notifications.
 */
export const handler = withApi(
  async function handler(req, res, { auth, tenantId }) {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('push_subscriptions')
        .select('id, endpoint, user_id, created_at')
        .eq('tenant_id', tenantId)
        .order('id', { ascending: false });
      if (error) throw error;
      return res.status(200).json({
        subscriptions: data || [],
        vapid_public_key: process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY || null,
      });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const action = body.action || 'subscribe';

      if (action === 'subscribe') {
        if (!body.endpoint || !body.keys) {
          return res.status(400).json({ error: 'endpoint and keys required' });
        }
        const { data: existing } = await supabase
          .from('push_subscriptions')
          .select('id')
          .eq('endpoint', body.endpoint)
          .maybeSingle();

        const row = {
          tenant_id: tenantId,
          user_id: auth.profile.id,
          endpoint: body.endpoint,
          p256dh: body.keys.p256dh || body.keys.p256DH || null,
          auth: body.keys.auth || null,
          user_agent: body.user_agent || null,
          updated_at: new Date().toISOString(),
        };

        let data;
        if (existing?.id) {
          const r = await supabase.from('push_subscriptions').update(row).eq('id', existing.id).select().single();
          if (r.error) throw r.error;
          data = r.data;
        } else {
          const r = await supabase.from('push_subscriptions').insert(row).select().single();
          if (r.error) throw r.error;
          data = r.data;
        }
        return res.status(201).json(data);
      }

      if (action === 'unsubscribe') {
        if (!body.endpoint) return res.status(400).json({ error: 'endpoint required' });
        await supabase.from('push_subscriptions').delete().eq('endpoint', body.endpoint).eq('tenant_id', tenantId);
        return res.status(200).json({ ok: true });
      }

      if (action === 'notify') {
        if (!['owner', 'manager', 'superadmin'].includes(auth.role)) {
          return res.status(403).json({ error: 'Only managers can broadcast' });
        }
        const title = body.title || 'رفد';
        const message = body.body || body.message || '';
        const type = body.type || 'info';

        const { data: notif, error } = await supabase
          .from('notifications')
          .insert({
            tenant_id: tenantId,
            title,
            body: message,
            type,
            is_read: false,
          })
          .select()
          .single();
        if (error) throw error;

        const { data: subs } = await supabase.from('push_subscriptions').select('*').eq('tenant_id', tenantId);
        let delivered = 0;
        const vapidPublic = process.env.VAPID_PUBLIC_KEY;
        const vapidPrivate = process.env.VAPID_PRIVATE_KEY;

        // Optional web-push if dependency and keys exist — graceful no-op otherwise
        if (vapidPublic && vapidPrivate && (subs || []).length) {
          try {
            const webpush = await import('web-push').catch(() => null);
            if (webpush?.default || webpush?.setVapidDetails) {
              const wp = webpush.default || webpush;
              wp.setVapidDetails('mailto:ops@rafd.app', vapidPublic, vapidPrivate);
              for (const s of subs) {
                try {
                  await wp.sendNotification(
                    {
                      endpoint: s.endpoint,
                      keys: { p256dh: s.p256dh, auth: s.auth },
                    },
                    JSON.stringify({ title, body: message, type })
                  );
                  delivered += 1;
                } catch {
                  /* expired endpoint */
                }
              }
            }
          } catch {
            /* optional */
          }
        }

        await supabase.from('audit_logs').insert({
          tenant_id: tenantId,
          user_id: auth.profile.id,
          action: 'push.notify',
          entity_type: 'notifications',
          entity_id: String(notif.id),
          meta: { delivered, subscribers: (subs || []).length },
        });

        return res.status(200).json({ notification: notif, delivered, subscribers: (subs || []).length });
      }

      return res.status(400).json({ error: 'Unknown action' });
    }

    return methodNotAllowed(res);
  },
  {
    permissions: {
      GET: 'notifications:read',
      // subscribe uses POST — cashiers may register devices; broadcast checks role in handler optionally
      POST: 'notifications:read',
    },
  }
);
