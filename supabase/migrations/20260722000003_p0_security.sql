-- RAFD P0 security hardening (run in Supabase SQL editor)
-- Service role (server) bypasses RLS. Anon/authenticated clients must be constrained.

-- Optional sales columns for offline idempotency + tax
ALTER TABLE sales ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS tax_rate numeric DEFAULT 0;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS tax_mode text;
CREATE UNIQUE INDEX IF NOT EXISTS sales_tenant_idempotency_uidx
  ON sales (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS weight_g numeric;
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS sold_by_weight boolean DEFAULT false;

ALTER TABLE sync_status ADD COLUMN IF NOT EXISTS server_version text;

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tax_enabled boolean;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tax_rate numeric;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tax_mode text;

-- Enable RLS (policies below are deny-by-default for anon)
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE backups ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

-- Example: block anonymous direct table access (API uses service role)
-- DROP open policies if any, then:
-- CREATE POLICY "deny_anon_products" ON products FOR ALL TO anon USING (false);

-- Recommended production: pass user JWT to user-scoped client and join app_users:
-- CREATE POLICY products_tenant_isolation ON products
-- FOR ALL TO authenticated
-- USING (
--   tenant_id IN (
--     SELECT tenant_id FROM app_users WHERE auth_id = auth.uid()::text OR email = auth.jwt()->>'email'
--   )
-- );
