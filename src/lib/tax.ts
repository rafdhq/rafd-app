/** VAT / tax helpers for Yemen & Saudi Arabia */

export type TaxMode = 'none' | 'inclusive' | 'exclusive';

export interface TaxConfig {
  enabled: boolean;
  rate: number; // e.g. 0.15 for 15%
  mode: TaxMode;
  label: string;
  tax_number?: string | null;
}

export function defaultTaxConfig(currency?: string, taxNumber?: string | null): TaxConfig {
  // Saudi default 15% VAT when SAR; Yemen default off unless configured
  if (currency === 'SAR') {
    return {
      enabled: true,
      rate: 0.15,
      mode: 'exclusive',
      label: 'ضريبة القيمة المضافة 15%',
      tax_number: taxNumber || null,
    };
  }
  return {
    enabled: false,
    rate: 0,
    mode: 'none',
    label: 'بدون ضريبة',
    tax_number: taxNumber || null,
  };
}

export function parseTenantTax(tenant: {
  currency?: string;
  tax_number?: string | null;
  tax_rate?: number | string | null;
  tax_mode?: string | null;
  tax_enabled?: boolean | null;
}): TaxConfig {
  const base = defaultTaxConfig(tenant.currency, tenant.tax_number);
  if (tenant.tax_enabled === false) return { ...base, enabled: false, rate: 0, mode: 'none' };
  if (tenant.tax_enabled === true || tenant.tax_rate != null) {
    const rate = Number(tenant.tax_rate ?? base.rate) || 0;
    const mode = (tenant.tax_mode as TaxMode) || (rate > 0 ? 'exclusive' : 'none');
    return {
      enabled: rate > 0 && mode !== 'none',
      rate,
      mode: rate > 0 ? mode : 'none',
      label: rate > 0 ? `ضريبة ${Math.round(rate * 100)}%` : base.label,
      tax_number: tenant.tax_number || null,
    };
  }
  return base;
}

export function calcTax(subtotalAfterDiscount: number, cfg: TaxConfig) {
  const base = Math.max(0, Number(subtotalAfterDiscount) || 0);
  if (!cfg.enabled || !cfg.rate || cfg.mode === 'none') {
    return { tax: 0, total: base, net: base };
  }
  if (cfg.mode === 'inclusive') {
    const net = base / (1 + cfg.rate);
    const tax = base - net;
    return {
      tax: roundMoney(tax),
      total: roundMoney(base),
      net: roundMoney(net),
    };
  }
  // exclusive
  const tax = base * cfg.rate;
  return {
    tax: roundMoney(tax),
    total: roundMoney(base + tax),
    net: roundMoney(base),
  };
}

function roundMoney(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
