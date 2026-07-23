import { describe, expect, it } from 'vitest';
import { AUDIT_COLUMNS, buildAuditRow } from './_lib/audit.js';

/**
 * Guards BL-03: the sales audit writer previously targeted non-existent columns
 * (`user_email`, `user_role`, `entity`) so every audit insert failed silently.
 * These tests pin the writer to the real `audit_logs` schema and fail loudly if
 * a legacy/misspelled column is ever reintroduced.
 */
describe('audit_logs writer schema (BL-03 drift guard)', () => {
  const sample = {
    tenantId: 1,
    userId: 2,
    action: 'sale.create',
    entityType: 'sales',
    entityId: 10,
    meta: { invoice_number: 'INV-1', total: 500 },
  };

  it('emits exactly the real audit_logs columns', () => {
    const row = buildAuditRow(sample);
    expect(Object.keys(row).sort()).toEqual([...AUDIT_COLUMNS].sort());
  });

  it('rejects the legacy BL-03 columns', () => {
    const row = buildAuditRow(sample);
    expect(row).not.toHaveProperty('entity'); // must be entity_type
    expect(row).not.toHaveProperty('user_email'); // must be user_id
    expect(row).not.toHaveProperty('user_role');
    expect(row).toHaveProperty('entity_type');
    expect(row).toHaveProperty('user_id');
  });

  it('stringifies entity_id (text column) and defaults meta to an object', () => {
    const row = buildAuditRow({ action: 'x', entityId: 42 });
    expect(row.entity_id).toBe('42');
    expect(typeof row.entity_id).toBe('string');
    expect(row.meta).toEqual({});
  });

  it('passes null entity_id through as null (not the string "null")', () => {
    const row = buildAuditRow({ action: 'x' });
    expect(row.entity_id).toBeNull();
  });
});
