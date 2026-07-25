import {
  Boxes,
  MessageCircle,
  Printer,
  WifiOff,
  BarChart3,
  ShieldCheck,
  Smartphone,
  Users,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';

export interface LoginFeature {
  icon: string;
  title: string;
  desc: string;
}

/**
 * Fixed allow-list of icons a superadmin may pick for a login feature.
 *
 * The stored value is only ever used as a key into this map — it is never
 * rendered as markup and never resolved to a component dynamically. An unknown
 * or malicious value simply falls back to FALLBACK_ICON, so a compromised
 * admin account cannot inject anything into the public login page.
 */
export const FEATURE_ICONS: Record<string, LucideIcon> = {
  'wifi-off': WifiOff,
  boxes: Boxes,
  printer: Printer,
  'message-circle': MessageCircle,
  'bar-chart': BarChart3,
  shield: ShieldCheck,
  smartphone: Smartphone,
  users: Users,
  sparkles: Sparkles,
};

export const FEATURE_ICON_KEYS = Object.keys(FEATURE_ICONS);

const FALLBACK_ICON = Sparkles;

export function resolveFeatureIcon(icon: unknown): LucideIcon {
  if (typeof icon !== 'string') return FALLBACK_ICON;
  return FEATURE_ICONS[icon] || FALLBACK_ICON;
}

/** Server-enforced limits, mirrored here so the editor can hint before saving. */
export const MAX_FEATURES = 6;
export const MAX_TITLE_LEN = 60;
export const MAX_DESC_LEN = 120;

/**
 * Shown instantly on the login page before (or instead of) the server reply,
 * so the panel is never empty even if /api/platform-settings is unreachable.
 * Mirrors the migration's seed values.
 */
export const DEFAULT_LOGIN_FEATURES: LoginFeature[] = [
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

/** Defensive parse of whatever the API returns; bad shapes yield []. */
export function parseLoginFeatures(raw: unknown): LoginFeature[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((f): f is Record<string, unknown> => !!f && typeof f === 'object')
    .map((f) => ({
      icon: typeof f.icon === 'string' ? f.icon : '',
      title: typeof f.title === 'string' ? f.title.slice(0, MAX_TITLE_LEN) : '',
      desc: typeof f.desc === 'string' ? f.desc.slice(0, MAX_DESC_LEN) : '',
    }))
    .filter((f) => f.title)
    .slice(0, MAX_FEATURES);
}
