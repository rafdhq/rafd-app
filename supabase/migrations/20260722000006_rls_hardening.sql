-- RAFD | رفد - RLS Hardening Migration
-- ============================================================================
-- Fixes Supabase Security Advisor: "RLS Disabled in Public" on many tables
-- This migration enables RLS on ALL public tables and applies deny-by-default
-- for anon role. Service role (used by api/*) bypasses RLS automatically.
--
-- Why RLS Disabled warning matters:
-- - With RLS disabled, anyone with anon key can read/write via PostgREST directly
-- - With RLS enabled + no allow policy, anon/authenticated are blocked by default
-- - API uses SUPABASE_SERVICE_ROLE_KEY which bypasses RLS, so functionality preserved
--
-- Intentionally RLS Disabled: NONE - all tables should have RLS enabled.
-- If a table truly needs public access, create explicit allow policy with reason.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Enable RLS on ALL tables (base + P1 + P2)
-- This is idempotent - safe to re-run
-- ---------------------------------------------------------------------------

-- Base schema tables
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_packaging ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_terminals ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE backups ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_bindings ENABLE ROW LEVEL SECURITY;

-- P1 tables
ALTER TABLE cashier_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE refund_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stocktake_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE stocktake_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_outbox ENABLE ROW LEVEL SECURITY;

-- P2 tables
ALTER TABLE loyalty_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_price_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE branch_price_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE manufacturing_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2) Explicit deny policies for anon role (defense-in-depth, clear intent)
-- Even without policies, RLS enabled = deny by default, but explicit deny makes intent clear
-- and satisfies some security scanners
-- ---------------------------------------------------------------------------

-- Helper: function to create deny policies via DO block for all tables
-- We'll create policies one-by-one for clarity and idempotency

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'tenants','branches','app_users','products','product_packaging',
    'customers','customer_ledger','suppliers','supplier_ledger',
    'sales','sale_items','expenses','bank_accounts','payment_terminals',
    'purchases','purchase_items','backups','audit_logs','sync_status',
    'notifications','tenant_catalog','platform_settings','subscription_plans',
    'tenant_subscriptions','subscription_payments','platform_announcements',
    'platform_payment_methods','device_bindings',
    'cashier_shifts','refunds','refund_items','stocktake_sessions','stocktake_lines',
    'user_invites','push_subscriptions','whatsapp_outbox',
    'loyalty_programs','loyalty_accounts','loyalty_ledger','loyalty_offers',
    'price_lists','product_prices','customer_price_overrides','branch_price_overrides',
    'recipes','recipe_items','manufacturing_orders','ai_conversations'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- Drop existing deny policies if any (idempotent)
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'deny_anon_' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'deny_authenticated_' || t, t);
    
    -- Create explicit deny for anon
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO anon USING (false)', 'deny_anon_' || t, t);
    
    -- Create explicit deny for authenticated (forces all direct client access via service_role API)
    -- This is secure default; future proper tenant isolation policies can replace this deny for authenticated
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO authenticated USING (false) WITH CHECK (false)', 'deny_authenticated_' || t, t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3) Document intentionally public or RLS-disabled tables (if any)
-- ---------------------------------------------------------------------------
-- Currently: NONE - all public schema tables have RLS enabled
-- If a table truly needs public read (e.g., subscription_plans for pricing page),
-- replace its deny policies with explicit allow:

-- Example for future public table (DO NOT enable now, just as reference):
-- DROP POLICY IF EXISTS deny_anon_subscription_plans ON subscription_plans;
-- CREATE POLICY allow_anon_read_subscription_plans ON subscription_plans FOR SELECT TO anon USING (is_active = true);
-- Reason: Pricing page needs public read of active plans without auth
-- But for RAFD, pricing is served via api/* with service_role, so deny is currently correct

-- ---------------------------------------------------------------------------
-- 4) Storage RLS - ensure storage.objects has RLS (should be enabled by default in Supabase)
-- Our bucket policies already created in 20260722000002_storage.sql
-- ---------------------------------------------------------------------------
-- Verify storage RLS is enabled (Supabase enables it by default)
-- No action needed, but we ensure policies exist for rafd-media already

-- ---------------------------------------------------------------------------
-- 5) Add comment for future tenant isolation (optional, not enforced yet)
-- ---------------------------------------------------------------------------
-- Future improvement: Replace deny_authenticated_* with tenant isolation:
-- CREATE POLICY tenant_isolation_products ON products FOR ALL TO authenticated
-- USING (tenant_id IN (SELECT tenant_id FROM app_users WHERE auth_id = auth.uid()::text))
-- Currently we keep deny-by-default because all access goes via service_role API
-- which bypasses RLS, preserving functionality while being secure.

-- Done
SELECT 'RLS hardening applied to all public tables' AS status;
