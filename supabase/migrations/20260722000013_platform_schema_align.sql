-- RAFD | رفد - Platform Admin schema alignment (P0 stabilization)
-- ============================================================================
-- ROOT CAUSE fixed here:
--   The Platform Admin panel (SuperAdmin.tsx) and its API handlers
--   (api/_lib/modules/platform-settings.js, subscription-plans.js,
--   platform-announcements.js, platform-payments.js) read and write a set of
--   columns that the base schema (20260722000001) never created. Every create/
--   update therefore failed in PostgREST with `PGRST204 / column ... does not
--   exist`, surfaced in the UI as "تعذر الحفظ" for packages, contact info,
--   platform settings, payment methods and announcements.
--
--   The real database schema (these migrations) is the source of truth, and it
--   had drifted from the application contract. This migration aligns the schema
--   to exactly what the code persists — no new features, no restructuring.
--
-- Fully idempotent: safe to run on every environment via `supabase db push`.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) platform_settings — branding, contact & platform preferences
--    Base table only had: id, trial_days, support_email, support_phone,
--    maintenance_mode, created_at, updated_at.
-- ---------------------------------------------------------------------------
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS app_name           TEXT DEFAULT 'RAFD';
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS app_name_ar        TEXT DEFAULT 'رفد';
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS logo_url           TEXT;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS favicon_url        TEXT;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS primary_color      TEXT DEFAULT '#0d9488';
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS secondary_color    TEXT DEFAULT '#d97706';
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS support_whatsapp   TEXT;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS website            TEXT;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS address            TEXT;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS default_currency   TEXT DEFAULT 'YER';
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS invoice_footer     TEXT;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS allow_registration BOOLEAN DEFAULT true;

-- Backfill the singleton settings row with the same defaults the API uses, so
-- the panel shows correct values immediately (instead of empty fields).
UPDATE platform_settings SET
  app_name         = COALESCE(NULLIF(app_name, ''), 'RAFD'),
  app_name_ar      = COALESCE(NULLIF(app_name_ar, ''), 'رفد'),
  primary_color    = COALESCE(NULLIF(primary_color, ''), '#0d9488'),
  secondary_color  = COALESCE(NULLIF(secondary_color, ''), '#d97706'),
  support_email    = COALESCE(NULLIF(support_email, ''), 'support@rafd.app'),
  support_phone    = COALESCE(NULLIF(support_phone, ''), '+967700000000'),
  support_whatsapp = COALESCE(support_whatsapp, '+967700000000'),
  website          = COALESCE(website, 'https://rafd.app'),
  address          = COALESCE(address, 'صنعاء، اليمن'),
  default_currency = COALESCE(NULLIF(default_currency, ''), 'YER'),
  invoice_footer   = COALESCE(invoice_footer, 'منصة رفد لإدارة متاجر البقالة'),
  updated_at       = now();

-- ---------------------------------------------------------------------------
-- 2) subscription_plans — packages (الباقات)
--    Base table used name_en (no name_ar), had no is_popular / sort_order, and
--    stored features as TEXT while the code reads/writes a JSON array.
-- ---------------------------------------------------------------------------
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS name_ar    TEXT;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS is_popular BOOLEAN DEFAULT false;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- The app persists `features` as an array (string[]). Convert TEXT -> jsonb so
-- the array round-trips correctly instead of erroring on insert.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'subscription_plans'
      AND column_name = 'features'
      AND data_type <> 'jsonb'
  ) THEN
    ALTER TABLE subscription_plans
      ALTER COLUMN features TYPE jsonb
      USING CASE
        WHEN features IS NULL OR btrim(features) = '' THEN '[]'::jsonb
        WHEN btrim(features) ~ '^\[.*\]$' THEN features::jsonb
        ELSE to_jsonb(string_to_array(features, E'\n'))
      END;
  END IF;
END $$;
ALTER TABLE subscription_plans ALTER COLUMN features SET DEFAULT '[]'::jsonb;

-- Backfill Arabic names from the English name where missing.
UPDATE subscription_plans SET name_ar = COALESCE(NULLIF(name_ar, ''), name_en, name);

-- ---------------------------------------------------------------------------
-- 3) platform_announcements — publish model used by the panel
--    Base table had is_active/starts_at/ends_at; the code uses
--    audience / is_published / publish_at.
-- ---------------------------------------------------------------------------
ALTER TABLE platform_announcements ADD COLUMN IF NOT EXISTS audience     TEXT DEFAULT 'all';
ALTER TABLE platform_announcements ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT true;
ALTER TABLE platform_announcements ADD COLUMN IF NOT EXISTS publish_at   TIMESTAMPTZ DEFAULT now();

-- Keep the two flags consistent for existing rows.
UPDATE platform_announcements SET is_published = COALESCE(is_published, is_active, true);

-- ---------------------------------------------------------------------------
-- 4) platform_payment_methods — payment methods shown in the panel
--    Base table used name_en (no name_ar) and had no provider / sort_order.
--    The handler GET also orders by sort_order, which previously errored.
-- ---------------------------------------------------------------------------
ALTER TABLE platform_payment_methods ADD COLUMN IF NOT EXISTS name_ar    TEXT;
ALTER TABLE platform_payment_methods ADD COLUMN IF NOT EXISTS provider   TEXT;
ALTER TABLE platform_payment_methods ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

UPDATE platform_payment_methods SET name_ar = COALESCE(NULLIF(name_ar, ''), name_en, name);

-- ============================================================================
-- DONE - Platform Admin edits (packages, contact info, platform settings,
--        payment methods, announcements) now persist to real columns.
-- ============================================================================
