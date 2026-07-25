import { supabase } from '../db-client.js';
import { requirePlatformAdmin, setCors } from '../auth-middleware.js';

/**
 * Icons a superadmin may choose for a login-page feature. Must stay in sync
 * with FEATURE_ICONS in src/lib/loginFeatures.ts. Anything outside this list is
 * coerced to 'sparkles', so the stored value can never be used to inject
 * arbitrary content into the public login page.
 */
const ALLOWED_FEATURE_ICONS = [
  'wifi-off',
  'boxes',
  'printer',
  'message-circle',
  'bar-chart',
  'shield',
  'smartphone',
  'users',
  'sparkles',
];

const MAX_FEATURES = 6;
const MAX_TITLE_LEN = 60;
const MAX_DESC_LEN = 120;

const DEFAULT_LOGIN_FEATURES = [
  {
    icon: 'wifi-off',
    title: 'نقطة بيع تعمل بلا إنترنت',
    desc: 'أكمل البيع أثناء الانقطاع والمزامنة تتم تلقائيًا',
  },
  {
    icon: 'boxes',
    title: 'مخزون وموردون وعملاء لحظيًا',
    desc: 'أرصدة ودفاتر حسابات محدّثة لحظة بلحظة',
  },
  {
    icon: 'printer',
    title: 'طباعة فواتير حرارية',
    desc: 'دعم ESC/POS مباشرة عبر USB أو Serial',
  },
  {
    icon: 'message-circle',
    title: 'كشوفات حساب عبر واتساب',
    desc: 'تصدير PDF أو صورة ومشاركتها مع العميل',
  },
];

function str(v, max) {
  if (typeof v !== 'string') return '';
  return v.trim().slice(0, max);
}

/**
 * Enforce shape, icon allow-list, length caps and item count server-side —
 * the admin UI limits are a convenience, this is the actual boundary.
 * Returns null when the caller did not supply the field, so PUT can leave the
 * stored value untouched instead of wiping it.
 */
function sanitizeLoginFeatures(raw) {
  if (raw == null) return null;

  let list = raw;
  if (typeof list === 'string') {
    try {
      list = JSON.parse(list);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];

  return list
    .filter((f) => f && typeof f === 'object' && !Array.isArray(f))
    .map((f) => ({
      icon: ALLOWED_FEATURE_ICONS.includes(f.icon) ? f.icon : 'sparkles',
      title: str(f.title, MAX_TITLE_LEN),
      desc: str(f.desc, MAX_DESC_LEN),
    }))
    .filter((f) => f.title)
    .slice(0, MAX_FEATURES);
}

/** Only allow http(s) links for the developer credit. */
function sanitizeLink(v) {
  const s = str(v, 300);
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Guarantee the login page always receives a usable feature list, even on an
 * environment where the login_features migration has not been applied yet.
 */
function withLoginDefaults(row) {
  if (!row) return row;
  const features = sanitizeLoginFeatures(row.login_features);
  return {
    ...row,
    login_features: features && features.length ? features : DEFAULT_LOGIN_FEATURES,
    developer_name: row.developer_name ?? null,
    developer_link: row.developer_link ?? null,
  };
}

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
  login_features: DEFAULT_LOGIN_FEATURES,
  developer_name: null,
  developer_link: null,
};


export const handler = async function handler(req, res) {
  setCors(req, res, 'GET, POST, PUT, OPTIONS');
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
        return res.status(200).json(withLoginDefaults(created));
      }
      return res.status(200).json(withLoginDefaults(data[0]));
    }

    if (req.method === 'PUT' || req.method === 'POST') {
      // Mutating platform settings is restricted to the superadmin.
      const auth = await requirePlatformAdmin(req, res);
      if (!auth) return;

      const body = req.body || {};
      const { data: existing } = await supabase
        .from('platform_settings')
        .select('id')
        .order('id', { ascending: true })
        .limit(1);

      // The SuperAdmin console saves one tab at a time via a shared handler, so
      // a payload that omits login_features must not wipe it. null = untouched.
      const features = sanitizeLoginFeatures(body.login_features);

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
        developer_name: str(body.developer_name, 80) || null,
        developer_link: sanitizeLink(body.developer_link),
        updated_at: new Date().toISOString(),
      };
      if (features !== null) payload.login_features = features;

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

      const { data, error } = await supabase
        .from('platform_settings')
        .insert({ login_features: DEFAULT_LOGIN_FEATURES, ...payload })
        .select()
        .single();
      if (error) throw error;
      return res.status(201).json(data);
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('platform-settings API error:', err);
    res.status(500).json({ error: err.message });
  }
}
