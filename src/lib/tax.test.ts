import { describe, expect, it } from 'vitest';
import { calcTax, defaultTaxConfig, parseTenantTax } from './tax';

describe('tax helpers', () => {
  it('defaults SAR to 15% exclusive VAT', () => {
    const cfg = defaultTaxConfig('SAR', '300123');
    expect(cfg.enabled).toBe(true);
    expect(cfg.rate).toBe(0.15);
    expect(cfg.tax_number).toBe('300123');
  });

  it('defaults YER to no tax', () => {
    const cfg = defaultTaxConfig('YER');
    expect(cfg.enabled).toBe(false);
    expect(calcTax(1000, cfg).tax).toBe(0);
    expect(calcTax(1000, cfg).total).toBe(1000);
  });

  it('calculates exclusive tax', () => {
    const r = calcTax(100, { enabled: true, rate: 0.15, mode: 'exclusive', label: 'VAT' });
    expect(r.tax).toBe(15);
    expect(r.total).toBe(115);
    expect(r.net).toBe(100);
  });

  it('calculates inclusive tax', () => {
    const r = calcTax(115, { enabled: true, rate: 0.15, mode: 'inclusive', label: 'VAT' });
    expect(r.total).toBe(115);
    expect(r.net).toBeCloseTo(100, 2);
    expect(r.tax).toBeCloseTo(15, 2);
  });

  it('parses tenant overrides', () => {
    const cfg = parseTenantTax({ currency: 'YER', tax_enabled: true, tax_rate: 0.05, tax_mode: 'exclusive' });
    expect(cfg.enabled).toBe(true);
    expect(cfg.rate).toBe(0.05);
  });
});
