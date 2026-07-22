import { describe, expect, it } from 'vitest';
import { EscPosBuilder, buildEscPosInvoice, buildOpenDrawerCommand } from './commands';

describe('ESC/POS builder', () => {
  it('starts with ESC @ init', () => {
    const b = new EscPosBuilder().build();
    expect(b[0]).toBe(0x1b);
    expect(b[1]).toBe(0x40);
  });

  it('open drawer command contains ESC p', () => {
    const d = buildOpenDrawerCommand(0);
    const str = Array.from(d);
    const idx = str.findIndex((v, i) => v === 0x1b && str[i + 1] === 0x70);
    expect(idx).toBeGreaterThanOrEqual(0);
  });

  it('builds invoice bytes with cut', () => {
    const bytes = buildEscPosInvoice({
      storeName: 'Test Store',
      invoiceNumber: 'INV-1',
      createdAtLabel: '2026-01-01',
      lines: [{ name: 'Milk', qtyLabel: '2', unitPriceLabel: '10', totalLabel: '20' }],
      subtotalLabel: '20',
      totalLabel: '20',
      openDrawer: true,
      cut: true,
    });
    expect(bytes.length).toBeGreaterThan(40);
    // GS V cut
    const arr = Array.from(bytes);
    expect(arr.includes(0x1d)).toBe(true);
  });
});
