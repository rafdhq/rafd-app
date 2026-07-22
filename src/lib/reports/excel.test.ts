import { describe, expect, it } from 'vitest';
import { toCsv, toExcelXml } from './excel';

describe('excel exporters', () => {
  it('builds csv with header and row', () => {
    const csv = toCsv(['a', 'b'], [{ a: 1, b: 'x' }]);
    expect(csv).toContain('a,b');
    expect(csv).toContain('1,x');
  });

  it('builds spreadsheetml workbook', () => {
    const xml = toExcelXml(['name', 'qty'], [{ name: 'Rice', qty: 3 }], 'Inv');
    expect(xml).toContain('Workbook');
    expect(xml).toContain('Rice');
    expect(xml).toContain('ss:Type="Number"');
  });
});
