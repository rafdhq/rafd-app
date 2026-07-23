import { supabase } from './db-client.js';

/**
 * Canonical column set of the `audit_logs` table.
 *
 * Verified against the live schema (information_schema.columns):
 *   tenant_id, user_id, action, entity_type, entity_id, meta  (+ id, created_at defaults)
 *
 * The historical `sales.js` writer used `user_email`, `user_role`, `entity`
 * (BL-03) — none of which exist — so every `sale.create` audit insert failed
 * silently inside a try/catch and no sales were ever audited. Centralising the
 * writer here (and asserting the shape in `api/audit.test.js`) prevents that
 * column drift from recurring.
 */
export const AUDIT_COLUMNS = Object.freeze([
  'tenant_id',
  'user_id',
  'action',
  'entity_type',
  'entity_id',
  'meta',
]);

/**
 * Build an `audit_logs` row from a normalised input, emitting ONLY real
 * schema columns. `entity_id` is always stringified (text column).
 */
export function buildAuditRow({ tenantId, userId, action, entityType, entityId, meta } = {}) {
  return {
    tenant_id: tenantId ?? null,
    user_id: userId ?? null,
    action,
    entity_type: entityType ?? null,
    entity_id: entityId != null ? String(entityId) : null,
    meta: meta ?? {},
  };
}

/**
 * Insert an audit row. Non-blocking by design: auditing must never break the
 * business operation it records, but — unlike the old inline writers — it now
 * targets the correct columns so the insert actually succeeds.
 */
export async function writeAudit(input) {
  try {
    await supabase.from('audit_logs').insert(buildAuditRow(input));
  } catch {
    /* non-blocking */
  }
}
