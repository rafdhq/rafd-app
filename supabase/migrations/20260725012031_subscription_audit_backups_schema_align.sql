-- RAFD | رفد - Subscription payments, tenant subscriptions, audit logs & backups schema alignment

-- ============================================================================

-- Continues the P0 stabilization started in 20260722000013_platform_schema_align.sql.

-- These columns are already read/written by application code but were never

-- added to the live schema, causing PGRST204 failures on payment submission,

-- admin review, audit trail writes, and backup persistence.

-- Idempotent: safe to run on every environment.

-- ============================================================================



-- subscription_payments — proof upload / admin review flow (api/_lib/modules/subscription.js)

ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS plan_code           TEXT;

ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS billing_cycle       TEXT;

ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS payment_method_id   INTEGER REFERENCES platform_payment_methods(id) ON DELETE SET NULL;

ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS payment_method_name TEXT;

ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS proof_url           TEXT;

ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS sender_name         TEXT;

ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS admin_notes         TEXT;

ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS reviewed_by         TEXT;

ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS reviewed_at         TIMESTAMPTZ;



-- tenant_subscriptions — set after a payment is approved

ALTER TABLE tenant_subscriptions ADD COLUMN IF NOT EXISTS last_payment_at TIMESTAMPTZ;



-- audit_logs — actor_email/entity used by loyalty.js, recipes.js, import-export.js writers

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_email TEXT;

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS entity      TEXT;



-- backups — api/_lib/modules/backups.js persists a JSON snapshot per backup row;

-- the base table only ever had file_url/file_size/type/status (an older,

-- unused external-file design). Table is currently empty in every environment,

-- so this is purely additive.

ALTER TABLE backups ADD COLUMN IF NOT EXISTS label        TEXT;

ALTER TABLE backups ADD COLUMN IF NOT EXISTS created_by   TEXT;

ALTER TABLE backups ADD COLUMN IF NOT EXISTS size_bytes   BIGINT;

ALTER TABLE backups ADD COLUMN IF NOT EXISTS kind         TEXT DEFAULT 'manual';

ALTER TABLE backups ADD COLUMN IF NOT EXISTS payload      JSONB;

ALTER TABLE backups ADD COLUMN IF NOT EXISTS payload_json TEXT;
