-- RAFD | رفد - RLS Tenant Isolation (Production-Ready, Scalable)
-- ============================================================================
-- Replaces temporary deny-all policies from 00006_rls_hardening with proper
-- multi-tenant isolation based on auth.uid() and tenant_id.
--
-- Design goals (as requested):
-- - Multi-Tenant Isolation: tenant_id = current_tenant_id() OR is_superadmin()
-- - Supabase Auth: uses auth.uid() and auth.jwt() -> email mapping to app_users
-- - Realtime: SELECT policies automatically filter Realtime subscriptions per tenant
-- - Offline Sync: sync_status, etc. use same tenant isolation
-- - Scalable: helper functions current_tenant_id() and is_superadmin() centralize logic
--
-- Previous migration 00006 was TEMPORARY (deny_all to fix Security Advisor warning quickly)
-- This migration is LONG-TERM (proper tenant isolation, no rebuild needed later)
--
-- API still uses service_role (bypasses RLS), so existing api/* continues to work.
-- Frontend direct Supabase queries (if any) will now respect tenant isolation via RLS.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0) Drop temporary deny policies from 00006
-- ---------------------------------------------------------------------------
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
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'deny_anon_' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'deny_authenticated_' || t, t);
    -- Also drop any previous tenant isolation policies if re-running
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'tenant_isolation_' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'tenant_isolation_select_' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'tenant_isolation_insert_' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'tenant_isolation_update_' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'tenant_isolation_delete_' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'deny_anon_all_' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'public_read_' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'superadmin_all_' || t, t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 1) Helper functions (SECURITY DEFINER, STABLE)
-- Centralize tenant lookup and superadmin check
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_superadmin() RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.app_users 
    WHERE (auth_id = auth.uid()::text OR email = (auth.jwt() ->> 'email'))
    AND role = 'superadmin'
    AND status = 'active'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.current_tenant_id() RETURNS INTEGER AS $$
  SELECT tenant_id FROM public.app_users 
  WHERE (auth_id = auth.uid()::text OR email = (auth.jwt() ->> 'email'))
  AND status = 'active'
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.current_app_user_id() RETURNS INTEGER AS $$
  SELECT id FROM public.app_users 
  WHERE (auth_id = auth.uid()::text OR email = (auth.jwt() ->> 'email'))
  AND status = 'active'
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Grant execute to authenticated (anon doesn't need)
GRANT EXECUTE ON FUNCTION public.is_superadmin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_tenant_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_app_user_id() TO authenticated;

-- ---------------------------------------------------------------------------
-- 2) Tenant-scoped tables with direct tenant_id
-- Policy: authenticated can access rows where tenant_id = current_tenant_id() OR is_superadmin()
-- anon is always denied (FOR ALL TO anon USING false)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  t TEXT;
  tenant_tables TEXT[] := ARRAY[
    'branches','products','product_packaging','customers','customer_ledger',
    'suppliers','supplier_ledger','sales','expenses','bank_accounts','payment_terminals',
    'purchases','backups','audit_logs','sync_status','notifications','tenant_catalog',
    'tenant_subscriptions','subscription_payments','device_bindings',
    'cashier_shifts','refunds','stocktake_sessions','user_invites','push_subscriptions',
    'whatsapp_outbox','loyalty_programs','loyalty_accounts','loyalty_ledger','loyalty_offers',
    'price_lists','product_prices','customer_price_overrides','branch_price_overrides',
    'recipes','manufacturing_orders','ai_conversations'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    -- Deny anon explicitly
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO anon USING (false)', 'deny_anon_' || t, t);
    
    -- Tenant isolation for authenticated (covers SELECT, INSERT, UPDATE, DELETE via FOR ALL)
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO authenticated USING (tenant_id = public.current_tenant_id() OR public.is_superadmin()) WITH CHECK (tenant_id = public.current_tenant_id() OR public.is_superadmin())',
      'tenant_isolation_' || t, t
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3) Special tables: tenants and app_users (self-referential)
-- ---------------------------------------------------------------------------

-- tenants: user can access their own tenant (id = current_tenant_id) or superadmin all
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_anon_tenants ON tenants;
DROP POLICY IF EXISTS tenant_isolation_tenants ON tenants;
CREATE POLICY deny_anon_tenants ON tenants FOR ALL TO anon USING (false);
CREATE POLICY tenant_isolation_tenants ON tenants FOR ALL TO authenticated 
  USING (id = public.current_tenant_id() OR public.is_superadmin())
  WITH CHECK (id = public.current_tenant_id() OR public.is_superadmin());

-- app_users: user can read users in same tenant + self, can update self, superadmin all
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_anon_app_users ON app_users;
DROP POLICY IF EXISTS tenant_isolation_app_users ON app_users;
CREATE POLICY deny_anon_app_users ON app_users FOR ALL TO anon USING (false);
CREATE POLICY tenant_isolation_app_users ON app_users FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id() OR auth_id = auth.uid()::text OR public.is_superadmin())
  WITH CHECK (tenant_id = public.current_tenant_id() OR public.is_superadmin());

-- ---------------------------------------------------------------------------
-- 4) Child tables without direct tenant_id (via parent)
-- Use EXISTS to check parent's tenant_id
-- ---------------------------------------------------------------------------

-- sale_items -> sales
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_anon_sale_items ON sale_items;
DROP POLICY IF EXISTS tenant_isolation_sale_items ON sale_items;
CREATE POLICY deny_anon_sale_items ON sale_items FOR ALL TO anon USING (false);
CREATE POLICY tenant_isolation_sale_items ON sale_items FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sales s 
      WHERE s.id = sale_items.sale_id 
      AND (s.tenant_id = public.current_tenant_id() OR public.is_superadmin())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sales s 
      WHERE s.id = sale_items.sale_id 
      AND (s.tenant_id = public.current_tenant_id() OR public.is_superadmin())
    )
  );

-- purchase_items -> purchases
ALTER TABLE purchase_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_anon_purchase_items ON purchase_items;
DROP POLICY IF EXISTS tenant_isolation_purchase_items ON purchase_items;
CREATE POLICY deny_anon_purchase_items ON purchase_items FOR ALL TO anon USING (false);
CREATE POLICY tenant_isolation_purchase_items ON purchase_items FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.purchases p 
      WHERE p.id = purchase_items.purchase_id 
      AND (p.tenant_id = public.current_tenant_id() OR public.is_superadmin())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.purchases p 
      WHERE p.id = purchase_items.purchase_id 
      AND (p.tenant_id = public.current_tenant_id() OR public.is_superadmin())
    )
  );

-- refund_items -> refunds
ALTER TABLE refund_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_anon_refund_items ON refund_items;
DROP POLICY IF EXISTS tenant_isolation_refund_items ON refund_items;
CREATE POLICY deny_anon_refund_items ON refund_items FOR ALL TO anon USING (false);
CREATE POLICY tenant_isolation_refund_items ON refund_items FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.refunds r 
      WHERE r.id = refund_items.refund_id 
      AND (r.tenant_id = public.current_tenant_id() OR public.is_superadmin())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.refunds r 
      WHERE r.id = refund_items.refund_id 
      AND (r.tenant_id = public.current_tenant_id() OR public.is_superadmin())
    )
  );

-- stocktake_lines -> stocktake_sessions
ALTER TABLE stocktake_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_anon_stocktake_lines ON stocktake_lines;
DROP POLICY IF EXISTS tenant_isolation_stocktake_lines ON stocktake_lines;
CREATE POLICY deny_anon_stocktake_lines ON stocktake_lines FOR ALL TO anon USING (false);
CREATE POLICY tenant_isolation_stocktake_lines ON stocktake_lines FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stocktake_sessions ss 
      WHERE ss.id = stocktake_lines.session_id 
      AND (ss.tenant_id = public.current_tenant_id() OR public.is_superadmin())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.stocktake_sessions ss 
      WHERE ss.id = stocktake_lines.session_id 
      AND (ss.tenant_id = public.current_tenant_id() OR public.is_superadmin())
    )
  );

-- recipe_items -> recipes
ALTER TABLE recipe_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_anon_recipe_items ON recipe_items;
DROP POLICY IF EXISTS tenant_isolation_recipe_items ON recipe_items;
CREATE POLICY deny_anon_recipe_items ON recipe_items FOR ALL TO anon USING (false);
CREATE POLICY tenant_isolation_recipe_items ON recipe_items FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.recipes r 
      WHERE r.id = recipe_items.recipe_id 
      AND (r.tenant_id = public.current_tenant_id() OR public.is_superadmin())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.recipes r 
      WHERE r.id = recipe_items.recipe_id 
      AND (r.tenant_id = public.current_tenant_id() OR public.is_superadmin())
    )
  );

-- ---------------------------------------------------------------------------
-- 5) Platform tables (no tenant_id or public pricing)
-- ---------------------------------------------------------------------------

-- subscription_plans: public read for active plans (pricing page), superadmin full
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_anon_subscription_plans ON subscription_plans;
DROP POLICY IF EXISTS public_read_subscription_plans ON subscription_plans;
DROP POLICY IF EXISTS tenant_isolation_subscription_plans ON subscription_plans;
-- Allow anon to read active plans (for public pricing page) - justified public access
CREATE POLICY public_read_subscription_plans ON subscription_plans FOR SELECT TO anon USING (is_active = true);
CREATE POLICY public_read_auth_subscription_plans ON subscription_plans FOR SELECT TO authenticated USING (is_active = true OR public.is_superadmin());
-- Superadmin can do all
CREATE POLICY superadmin_all_subscription_plans ON subscription_plans FOR ALL TO authenticated USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

-- platform_settings: authenticated can read, superadmin all
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_anon_platform_settings ON platform_settings;
DROP POLICY IF EXISTS public_read_platform_settings ON platform_settings;
DROP POLICY IF EXISTS superadmin_all_platform_settings ON platform_settings;
CREATE POLICY deny_anon_platform_settings ON platform_settings FOR ALL TO anon USING (false);
CREATE POLICY public_read_platform_settings ON platform_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY superadmin_all_platform_settings ON platform_settings FOR ALL TO authenticated USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

-- platform_announcements: public read active announcements
ALTER TABLE platform_announcements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_anon_platform_announcements ON platform_announcements;
DROP POLICY IF EXISTS public_read_platform_announcements ON platform_announcements;
DROP POLICY IF EXISTS superadmin_all_platform_announcements ON platform_announcements;
CREATE POLICY public_read_platform_announcements ON platform_announcements FOR SELECT TO anon USING (is_active = true);
CREATE POLICY public_read_auth_platform_announcements ON platform_announcements FOR SELECT TO authenticated USING (is_active = true OR public.is_superadmin());
CREATE POLICY superadmin_all_platform_announcements ON platform_announcements FOR ALL TO authenticated USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

-- platform_payment_methods: public read active methods
ALTER TABLE platform_payment_methods ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deny_anon_platform_payment_methods ON platform_payment_methods;
DROP POLICY IF EXISTS public_read_platform_payment_methods ON platform_payment_methods;
DROP POLICY IF EXISTS superadmin_all_platform_payment_methods ON platform_payment_methods;
CREATE POLICY public_read_platform_payment_methods ON platform_payment_methods FOR SELECT TO anon USING (is_active = true);
CREATE POLICY public_read_auth_platform_payment_methods ON platform_payment_methods FOR SELECT TO authenticated USING (is_active = true OR public.is_superadmin());
CREATE POLICY superadmin_all_platform_payment_methods ON platform_payment_methods FOR ALL TO authenticated USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

-- ---------------------------------------------------------------------------
-- 6) Realtime support: ensure tables are in supabase_realtime publication
-- (Supabase enables realtime via Dashboard, but we ensure publication includes tables)
-- This is optional - user can enable realtime per table in Dashboard
-- ---------------------------------------------------------------------------
-- DO NOT auto-add all tables to realtime - let owner enable selectively in Dashboard
-- But we document which tables benefit from realtime:
-- - sales, sale_items (POS realtime)
-- - notifications (real-time notifications)
-- - products (stock updates)
-- - cashier_shifts, etc.

-- ---------------------------------------------------------------------------
-- 7) Verification
-- ---------------------------------------------------------------------------
SELECT 'RLS tenant isolation policies applied - scalable design ready for Auth, Realtime, Offline Sync' AS status;

-- List of tables now with RLS enabled and tenant isolation (for verification)
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND rowsecurity = true
ORDER BY tablename;
