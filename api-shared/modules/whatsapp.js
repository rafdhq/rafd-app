import supabase from '../db-client.js';
import { withApi } from '../handler.js';
import { methodNotAllowed } from '../auth-middleware.js';

/**
 * WhatsApp Business messaging.
 * - Always returns a wa.me deep link (works offline-ready on devices with WhatsApp).
 * - If WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID are set, also attempts Cloud API send.
 */
export default withApi(
  async function handler(req, res, { auth, tenantId }) {
    if (req.method !== 'POST') return methodNotAllowed(res);

    const body = req.body || {};
    const phone = String(body.phone || '').replace(/\D/g, '');
    const text = String(body.text || body.message || '').trim();
    if (!phone || !text) return res.status(400).json({ error: 'phone and text required' });

    const deepLink = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
    let apiResult = null;
    let channel = 'deeplink';

    const token = process.env.WHATSAPP_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (token && phoneId) {
      try {
        const resp = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: phone,
            type: 'text',
            text: { body: text },
          }),
        });
        apiResult = await resp.json();
        if (resp.ok) channel = 'cloud_api';
      } catch (err) {
        apiResult = { error: err.message };
      }
    }

    await supabase.from('whatsapp_outbox').insert({
      tenant_id: tenantId,
      user_id: auth.profile.id,
      phone,
      message: text,
      channel,
      status: channel === 'cloud_api' ? 'sent' : 'deeplink',
      meta: apiResult || {},
      reference: body.reference || null,
    });

    await supabase.from('audit_logs').insert({
      tenant_id: tenantId,
      user_id: auth.profile.id,
      action: 'whatsapp.send',
      entity_type: 'whatsapp_outbox',
      entity_id: phone,
      meta: { channel, reference: body.reference || null },
    });

    return res.status(200).json({ ok: true, channel, deep_link: deepLink, api: apiResult });
  },
  { permissions: { POST: 'notifications:write' } }
);
