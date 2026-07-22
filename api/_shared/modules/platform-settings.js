import { supabase } from '../db-client.js';

const DEFAULTS = {
  app_name: 'RAFD',
  app_name_ar: 'رفد',
  logo_url: null,
  favicon_url: null,
  primary_color: '#0d9488',
  secondary_color: '#d97706',
  support_email: 'support@rafd.app',
  support_phone: '+967700000000',
  support_whatsapp: '+967700000000',
  website: 'https://rafd.app',
  address: 'صنعاء، اليمن',
  trial_days: 14,
  default_currency: 'YER',
  invoice_footer: 'منصة رفد لإدارة متاجر البقالة',
  maintenance_mode: false,
  allow_registration: true,
};

export const handler = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('platform_settings')
        .select('*')
        .order('id', { ascending: true })
        .limit(1);
      if (error) throw error;
      if (!data?.length) {
        const { data: created, error: cErr } = await supabase
          .from('platform_settings')
          .insert(DEFAULTS)
          .select()
          .single();
        if (cErr) throw cErr;
        return res.status(200).json(created);
      }
      return res.status(200).json(data[0]);
    }

    if (req.method === 'PUT' || req.method === 'POST') {
      const body = req.body || {};
      const { data: existing } = await supabase
        .from('platform_settings')
        .select('id')
        .order('id', { ascending: true })
        .limit(1);

      const payload = {
        app_name: body.app_name ?? DEFAULTS.app_name,
        app_name_ar: body.app_name_ar ?? DEFAULTS.app_name_ar,
        logo_url: body.logo_url ?? null,
        favicon_url: body.favicon_url ?? null,
        primary_color: body.primary_color ?? DEFAULTS.primary_color,
        secondary_color: body.secondary_color ?? DEFAULTS.secondary_color,
        support_email: body.support_email ?? DEFAULTS.support_email,
        support_phone: body.support_phone ?? DEFAULTS.support_phone,
        support_whatsapp: body.support_whatsapp ?? DEFAULTS.support_whatsapp,
        website: body.website ?? DEFAULTS.website,
        address: body.address ?? DEFAULTS.address,
        trial_days: body.trial_days ?? DEFAULTS.trial_days,
        default_currency: body.default_currency ?? DEFAULTS.default_currency,
        invoice_footer: body.invoice_footer ?? DEFAULTS.invoice_footer,
        maintenance_mode: body.maintenance_mode ?? false,
        allow_registration: body.allow_registration ?? true,
        updated_at: new Date().toISOString(),
      };

      if (existing?.[0]?.id) {
        const { data, error } = await supabase
          .from('platform_settings')
          .update(payload)
          .eq('id', existing[0].id)
          .select()
          .single();
        if (error) throw error;
        return res.status(200).json(data);
      }

      const { data, error } = await supabase.from('platform_settings').insert(payload).select().single();
      if (error) throw error;
      return res.status(201).json(data);
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('platform-settings API error:', err);
    res.status(500).json({ error: err.message });
  }
}
