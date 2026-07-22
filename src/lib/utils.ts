import { isWeightCategory } from './catalog';

export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

/** Force Western (English) digits everywhere — Arabic UI text stays Arabic */
export const APP_NUMBER_LOCALE = 'en-US';
export const APP_DATE_LOCALE = 'en-GB';

export function formatMoney(
  amount: number | string | null | undefined,
  currency = 'YER',
  locale = APP_NUMBER_LOCALE
) {
  const value = Number(amount || 0);
  const cur = currency || 'YER';
  // YER often displays cleaner without minor units
  const fraction = cur === 'YER' ? 0 : 2;
  try {
    // en-US / numberingSystem latn → 0-9 English digits
    return new Intl.NumberFormat(locale || APP_NUMBER_LOCALE, {
      style: 'currency',
      currency: cur,
      maximumFractionDigits: fraction,
      minimumFractionDigits: fraction,
    }).format(value);
  } catch {
    return `${value.toFixed(fraction)} ${cur === 'YER' ? 'YER' : cur}`;
  }
}

export function unitCostFromCarton(cartonCost: number, unitsPerCarton: number) {
  const u = Number(unitsPerCarton || 0);
  const c = Number(cartonCost || 0);
  if (!u) return 0;
  return Math.round((c / u) * 10000) / 10000;
}

export function paymentMethodLabel(method?: string | null) {
  if (!method) return '—';
  const raw = String(method);
  const key = raw.split(':')[0];
  if (key === 'cash') return 'نقدي';
  if (key === 'card') return 'بطاقة / نقطة دفع';
  if (key === 'credit' || key === 'ajil') return 'آجل';
  if (key === 'transfer') return 'تحويل بنكي';
  if (key === 'wallet') return 'محفظة إلكترونية';
  if (key === 'split') return 'مقسّم';
  if (key === 'pos') return 'جهاز شبكة';
  return raw;
}

export const WALLET_PROVIDERS = [
  { id: 'jawali', label: 'جوالي' },
  { id: 'one_cash', label: 'ون كاش' },
  { id: 'mobile_money', label: 'موبايل موني' },
  { id: 'stc_pay', label: 'STC Pay' },
  { id: 'apple_pay', label: 'Apple Pay' },
  { id: 'other_wallet', label: 'محفظة أخرى' },
] as const;

export const CARD_NETWORKS = [
  { id: 'mada', label: 'مدى' },
  { id: 'visa', label: 'Visa' },
  { id: 'mastercard', label: 'Mastercard' },
  { id: 'network', label: 'شبكة محلية' },
  { id: 'contactless', label: 'لمس / NFC' },
] as const;

export function formatNumber(n: number | string | null | undefined, locale = APP_NUMBER_LOCALE) {
  return new Intl.NumberFormat(locale || APP_NUMBER_LOCALE).format(Number(n || 0));
}

export function formatDate(date: string | Date | null | undefined, locale = APP_DATE_LOCALE) {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale || APP_DATE_LOCALE, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(d);
}

export function formatDateTime(date: string | Date | null | undefined, locale = APP_DATE_LOCALE) {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale || APP_DATE_LOCALE, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

export function timeAgo(date: string | Date | null | undefined) {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return 'الآن';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `منذ ${minutes} د`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `منذ ${hours} س`;
  const days = Math.floor(hours / 24);
  return `منذ ${days} يوم`;
}

export function generateInvoiceNumber() {
  const now = new Date();
  const y = now.getFullYear().toString().slice(2);
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const r = Math.floor(Math.random() * 9000 + 1000);
  return `INV-${y}${m}${d}-${r}`;
}

export function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function shareWhatsApp(phone: string, text: string) {
  const cleaned = phone.replace(/\D/g, '');
  const url = cleaned
    ? `https://wa.me/${cleaned}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank');
}

export const COUNTRY_CODES = [
  { code: '+967', label: 'اليمن', flag: '🇾🇪', iso: 'YE' },
  { code: '+966', label: 'السعودية', flag: '🇸🇦', iso: 'SA' },
  { code: '+971', label: 'الإمارات', flag: '🇦🇪', iso: 'AE' },
  { code: '+968', label: 'عُمان', flag: '🇴🇲', iso: 'OM' },
  { code: '+974', label: 'قطر', flag: '🇶🇦', iso: 'QA' },
  { code: '+973', label: 'البحرين', flag: '🇧🇭', iso: 'BH' },
  { code: '+965', label: 'الكويت', flag: '🇰🇼', iso: 'KW' },
  { code: '+962', label: 'الأردن', flag: '🇯🇴', iso: 'JO' },
  { code: '+20', label: 'مصر', flag: '🇪🇬', iso: 'EG' },
  { code: '+1', label: 'USA/Canada', flag: '🇺🇸', iso: 'US' },
] as const;

export function buildWhatsAppNumber(countryCode: string, localPhone: string) {
  const local = String(localPhone || '').replace(/\D/g, '').replace(/^0+/, '');
  const cc = String(countryCode || '').replace(/\D/g, '');
  if (!local) return '';
  return `+${cc}${local}`;
}

export function parseStoredPhone(phone?: string | null): { countryCode: string; local: string } {
  const raw = String(phone || '').trim();
  if (!raw) return { countryCode: '+967', local: '' };
  const digits = raw.replace(/\D/g, '');
  const match = [...COUNTRY_CODES]
    .sort((a, b) => b.code.length - a.code.length)
    .find((c) => digits.startsWith(c.code.replace('+', '')));
  if (match) {
    return {
      countryCode: match.code,
      local: digits.slice(match.code.replace('+', '').length),
    };
  }
  return { countryCode: '+967', local: digits };
}

/** Products sold by weight (price per kg, enter grams). */
export function isWeightProduct(product: {
  category?: string | null;
  unit?: string | null;
  name_ar?: string | null;
  name?: string | null;
  sell_by_weight?: boolean | null;
}) {
  if (product.sell_by_weight) return true;
  const cat = (product.category || '').trim();
  const unit = (product.unit || '').trim().toLowerCase();
  if (cat && isWeightCategory(cat)) return true;
  if (unit.includes('كجم') || unit.includes('kg') || unit.includes('غرام') || unit === 'g') return true;
  return false;
}

export function lineAmount(line: {
  product: { price: number };
  quantity: number;
  discount?: number;
  weight_g?: number;
  sold_by_weight?: boolean;
}) {
  if (line.sold_by_weight || (line.weight_g != null && line.weight_g > 0)) {
    const kg = Number(line.weight_g || 0) / 1000;
    return Math.max(0, kg * Number(line.product.price) - Number(line.discount || 0));
  }
  return Math.max(0, Number(line.product.price) * Number(line.quantity) - Number(line.discount || 0));
}

export function formatWeightLabel(weight_g?: number) {
  if (weight_g == null) return '';
  if (weight_g >= 1000) return `${(weight_g / 1000).toFixed(weight_g % 1000 === 0 ? 0 : 3)} كجم`;
  return `${Math.round(weight_g)} غرام`;
}

export function buildDetailedInvoiceText(opts: {
  tenantName: string;
  tenantAddress?: string | null;
  invoiceNumber: string;
  customerName?: string | null;
  customerPhone?: string | null;
  paymentMethod?: string | null;
  createdAt?: string | null;
  items: Array<{ name: string; qtyLabel: string; unitPrice: number; total: number }>;
  subtotal: number;
  discount: number;
  tax?: number;
  total: number;
  paid?: number;
  currency: string;
  footer?: string | null;
}) {
  const cur = opts.currency || 'YER';
  const lines = [
    opts.tenantName,
    opts.tenantAddress || '',
    '────────────────',
    `فاتورة: ${opts.invoiceNumber}`,
    `التاريخ: ${formatDateTime(opts.createdAt || new Date())}`,
    `العميل: ${opts.customerName || 'عميل نقدي'}`,
    opts.customerPhone ? `واتساب: ${opts.customerPhone}` : '',
    `الدفع: ${paymentMethodLabel(opts.paymentMethod)}`,
    '────────────────',
    ...opts.items.map(
      (it, i) =>
        `${i + 1}) ${it.name}\n   ${it.qtyLabel} × ${formatMoney(it.unitPrice, cur)} = ${formatMoney(it.total, cur)}`
    ),
    '────────────────',
    `المجموع: ${formatMoney(opts.subtotal, cur)}`,
    opts.discount ? `الخصم: -${formatMoney(opts.discount, cur)}` : '',
    opts.tax ? `الضريبة: ${formatMoney(opts.tax, cur)}` : '',
    `الإجمالي: ${formatMoney(opts.total, cur)}`,
    opts.paid != null ? `المدفوع: ${formatMoney(opts.paid, cur)}` : '',
    opts.paid != null && opts.total - opts.paid > 0
      ? `المتبقي آجل: ${formatMoney(opts.total - opts.paid, cur)}`
      : '',
    '────────────────',
    opts.footer || 'شكراً لتسوقكم معنا — رفد | RAFD',
  ].filter(Boolean);
  return lines.join('\n');
}

export const ROLES = [
  { id: 'owner', label: 'المالك', labelEn: 'Owner' },
  { id: 'manager', label: 'مدير', labelEn: 'Manager' },
  { id: 'cashier', label: 'كاشير', labelEn: 'Cashier' },
  { id: 'warehouse', label: 'مستودع', labelEn: 'Warehouse' },
  { id: 'accountant', label: 'محاسب', labelEn: 'Accountant' },
  { id: 'superadmin', label: 'مسؤول النظام', labelEn: 'Super Admin' },
] as const;

export type RoleId = (typeof ROLES)[number]['id'];

export function roleLabel(role?: string | null) {
  return ROLES.find((r) => r.id === role)?.label || role || '—';
}
