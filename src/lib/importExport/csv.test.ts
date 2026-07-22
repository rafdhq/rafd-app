import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv';

describe('csv import parser', () => {
  it('parses simple csv with bom', () => {
    const text = '\uFEFFname,phone\n"Ali, Co",+96777\nMona,123';
    const { columns, rows } = parseCsv(text);
    expect(columns).toEqual(['name', 'phone']);
    expect(rows[0].name).toBe('Ali, Co');
    expect(rows[1].phone).toBe('123');
  });
});
