-- RAFD P2 schema — AI, loyalty, multi-price, BOM/recipes, manufacturing
-- Run after p0_security.sql and p1_features.sql

-- Loyalty program config per tenant
CREATE TABLE IF NOT EXISTS loyalty_programs (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  enabled BOOLEAN DEFAULT true,
  points_per_currency NUMERIC DEFAULT 1,
  redemption_rate NUMERIC DEFAULT 100,
  min_redeem_points NUMERIC DEFAULT 100,
  bronze_min NUMERIC DEFAULT 0,
  silver_min NUMERIC DEFAULT 500,
  gold_min NUMERIC DEFAULT 2000,
  platinum_min NUMERIC DEFAULT 5000,
  auto_offer_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS loyalty_accounts (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  customer_id INTEGER NOT NULL,
  points_balance NUMERIC DEFAULT 0,
  lifetime_points NUMERIC DEFAULT 0,
  tier TEXT DEFAULT 'bronze',
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS loyalty_ledger (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  customer_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  points NUMERIC NOT NULL,
  balance_after NUMERIC DEFAULT 0,
  reference TEXT,
  sale_id INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS loyalty_offers (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  title_en TEXT,
  description TEXT,
  offer_type TEXT DEFAULT 'percent',
  value NUMERIC DEFAULT 0,
  min_tier TEXT DEFAULT 'bronze',
  min_points NUMERIC DEFAULT 0,
  active BOOLEAN DEFAULT true,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Multi-price lists
CREATE TABLE IF NOT EXISTS price_lists (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  name_en TEXT,
  is_default BOOLEAN DEFAULT false,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_prices (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  price_list_id INTEGER NOT NULL,
  price NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customer_price_overrides (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  customer_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  price NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS branch_price_overrides (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  branch_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  price_list_id INTEGER,
  price NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Restaurant BOM / recipes
CREATE TABLE IF NOT EXISTS recipes (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  name_en TEXT,
  yield_qty NUMERIC DEFAULT 1,
  notes TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recipe_items (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  recipe_id INTEGER NOT NULL,
  ingredient_product_id INTEGER NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit TEXT DEFAULT 'حبة',
  waste_pct NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS manufacturing_orders (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  branch_id INTEGER,
  recipe_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 1,
  status TEXT DEFAULT 'draft',
  notes TEXT,
  created_by TEXT,
  posted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- AI assistant chat log (tenant-scoped, for audit/history)
CREATE TABLE IF NOT EXISTS ai_conversations (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  user_id INTEGER,
  role TEXT DEFAULT 'user',
  message TEXT NOT NULL,
  answer TEXT,
  meta JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loyalty_accounts_tenant ON loyalty_accounts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_accounts_customer ON loyalty_accounts(customer_id);
CREATE INDEX IF NOT EXISTS idx_product_prices_product ON product_prices(product_id);
CREATE INDEX IF NOT EXISTS idx_recipes_product ON recipes(product_id);
CREATE INDEX IF NOT EXISTS idx_recipe_items_recipe ON recipe_items(recipe_id);
CREATE INDEX IF NOT EXISTS idx_mfg_tenant ON manufacturing_orders(tenant_id);
