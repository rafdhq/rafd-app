-- RAFD | رفد - Base Schema
-- ============================================================================
-- Foundation tables for RAFD Retail ERP
-- This file MUST be executed BEFORE p0_security.sql, p1_features.sql, p2_features.sql
-- All objects use IF NOT EXISTS for idempotent execution
-- ============================================================================
-- Execution order:
-- 1) 000_base_schema.sql  (this file)
-- 2) p0_security.sql
-- 3) p1_features.sql
-- 4) p2_features.sql
-- ============================================================================

-- Enable UUID generation if needed (optional)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tenants (المتاجر / المستأجرون)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenants (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  name_ar TEXT,
  logo_url TEXT,
  primary_color TEXT DEFAULT '#0d9488',
  secondary_color TEXT DEFAULT '#d97706',
  currency TEXT DEFAULT 'YER',
  plan TEXT DEFAULT 'growth',
  status TEXT DEFAULT 'trial',
  phone TEXT,
  email TEXT,
  address TEXT,
  tax_number TEXT,
  invoice_footer TEXT DEFAULT 'شكراً لتسوقكم معنا',
  business_type TEXT DEFAULT 'grocery',
  tax_enabled BOOLEAN DEFAULT false,
  tax_rate NUMERIC DEFAULT 0,
  tax_mode TEXT DEFAULT 'exclusive',
  enabled_categories TEXT,
  custom_categories TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Branches (الفروع)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS branches (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  is_main BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_branches_tenant ON branches(tenant_id);

-- ---------------------------------------------------------------------------
-- App Users (مستخدمي التطبيق - linked to Supabase Auth)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_users (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
  auth_id TEXT,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT DEFAULT 'cashier',
  phone TEXT,
  branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'active',
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_email ON app_users(email);
CREATE INDEX IF NOT EXISTS idx_app_users_tenant ON app_users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_app_users_auth ON app_users(auth_id);

-- ---------------------------------------------------------------------------
-- Products (المنتجات)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  sku TEXT NOT NULL,
  barcode TEXT,
  category TEXT DEFAULT 'عام',
  price NUMERIC NOT NULL DEFAULT 0,
  cost NUMERIC NOT NULL DEFAULT 0,
  stock NUMERIC NOT NULL DEFAULT 0,
  min_stock NUMERIC NOT NULL DEFAULT 5,
  unit TEXT DEFAULT 'حبة',
  image_url TEXT,
  is_active BOOLEAN DEFAULT true,
  supplier_id INTEGER,
  supplier_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_products_tenant ON products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE UNIQUE INDEX IF NOT EXISTS products_tenant_sku_uidx ON products(tenant_id, sku);

-- ---------------------------------------------------------------------------
-- Product Packaging (تفاصيل الكرتون / الوحدة)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_packaging (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  units_per_carton INTEGER NOT NULL DEFAULT 1,
  carton_cost NUMERIC NOT NULL DEFAULT 0,
  unit_cost NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_product_packaging_product ON product_packaging(product_id);
CREATE INDEX IF NOT EXISTS idx_product_packaging_tenant ON product_packaging(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS product_packaging_product_uidx ON product_packaging(product_id);

-- ---------------------------------------------------------------------------
-- Customers (العملاء - آجل)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  balance NUMERIC DEFAULT 0,
  total_purchases NUMERIC DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customers_tenant ON customers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);

-- ---------------------------------------------------------------------------
-- Customer Ledger (دفتر حساب العميل)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customer_ledger (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  balance_after NUMERIC DEFAULT 0,
  reference TEXT,
  notes TEXT,
  sale_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customer_ledger_tenant ON customer_ledger(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customer_ledger_customer ON customer_ledger(customer_id);

-- ---------------------------------------------------------------------------
-- Suppliers (الموردون)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS suppliers (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  balance NUMERIC DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_suppliers_tenant ON suppliers(tenant_id);

-- ---------------------------------------------------------------------------
-- Supplier Ledger (دفتر المورد)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS supplier_ledger (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  balance_after NUMERIC DEFAULT 0,
  reference TEXT,
  notes TEXT,
  purchase_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_supplier_ledger_tenant ON supplier_ledger(tenant_id);

-- ---------------------------------------------------------------------------
-- Sales (المبيعات / الفواتير)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sales (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL,
  invoice_number TEXT NOT NULL,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  customer_name TEXT,
  subtotal NUMERIC DEFAULT 0,
  discount NUMERIC DEFAULT 0,
  tax NUMERIC DEFAULT 0,
  total NUMERIC DEFAULT 0,
  paid NUMERIC DEFAULT 0,
  payment_method TEXT DEFAULT 'cash',
  status TEXT DEFAULT 'completed',
  notes TEXT,
  created_by TEXT,
  bank_account_id INTEGER,
  idempotency_key TEXT,
  tax_rate NUMERIC DEFAULT 0,
  tax_mode TEXT DEFAULT 'exclusive',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sales_tenant ON sales(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sales_invoice ON sales(invoice_number);
CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at);
CREATE UNIQUE INDEX IF NOT EXISTS sales_tenant_idempotency_uidx ON sales(tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Sale Items (بنود الفاتورة)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sale_items (
  id SERIAL PRIMARY KEY,
  sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  quantity NUMERIC DEFAULT 1,
  unit_price NUMERIC DEFAULT 0,
  total NUMERIC DEFAULT 0,
  weight_g NUMERIC,
  sold_by_weight BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items(product_id);

-- ---------------------------------------------------------------------------
-- Expenses (المصروفات)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS expenses (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL,
  category TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  description TEXT,
  payment_method TEXT DEFAULT 'cash',
  expense_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_expenses_tenant ON expenses(tenant_id);

-- ---------------------------------------------------------------------------
-- Bank Accounts (الحسابات البنكية)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bank_accounts (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  bank_name TEXT NOT NULL,
  account_name TEXT NOT NULL,
  account_number TEXT,
  iban TEXT,
  currency TEXT DEFAULT 'YER',
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_tenant ON bank_accounts(tenant_id);

-- ---------------------------------------------------------------------------
-- Payment Terminals (أجهزة الدفع الشبكي)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payment_terminals (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  provider TEXT DEFAULT 'generic',
  terminal_id TEXT,
  connection_type TEXT DEFAULT 'network',
  is_active BOOLEAN DEFAULT true,
  supports_contactless BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payment_terminals_tenant ON payment_terminals(tenant_id);

-- ---------------------------------------------------------------------------
-- Purchases (المشتريات من الموردين)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS purchases (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_name TEXT,
  reference TEXT,
  total NUMERIC DEFAULT 0,
  paid NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'completed',
  purchase_date TIMESTAMPTZ DEFAULT now(),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_purchases_tenant ON purchases(tenant_id);

-- ---------------------------------------------------------------------------
-- Purchase Items
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS purchase_items (
  id SERIAL PRIMARY KEY,
  purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  quantity NUMERIC DEFAULT 0,
  unit TEXT DEFAULT 'حبة',
  unit_cost NUMERIC DEFAULT 0,
  total NUMERIC DEFAULT 0,
  units_per_carton INTEGER DEFAULT 1,
  cartons NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON purchase_items(purchase_id);

-- ---------------------------------------------------------------------------
-- Backups (سجل النسخ الاحتياطي)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS backups (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id INTEGER,
  file_url TEXT,
  file_size INTEGER,
  type TEXT DEFAULT 'manual',
  status TEXT DEFAULT 'completed',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_backups_tenant ON backups(tenant_id);

-- ---------------------------------------------------------------------------
-- Audit Logs (سجل التدقيق)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
  user_id INTEGER,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  meta JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_logs(tenant_id);

-- ---------------------------------------------------------------------------
-- Sync Status (حالة المزامنة)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_status (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'synced',
  last_sync_at TIMESTAMPTZ,
  message TEXT,
  pending_changes INTEGER DEFAULT 0,
  server_version TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sync_tenant ON sync_status(tenant_id);

-- ---------------------------------------------------------------------------
-- Notifications (الإشعارات داخل التطبيق)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  type TEXT DEFAULT 'info',
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_tenant ON notifications(tenant_id);

-- ---------------------------------------------------------------------------
-- Tenant Catalog (نشاط المتجر والفئات المفعلة)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenant_catalog (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  business_type TEXT DEFAULT 'grocery',
  enabled_categories TEXT,
  custom_categories TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_catalog_tenant_uidx ON tenant_catalog(tenant_id);

-- ---------------------------------------------------------------------------
-- Platform tables (للوحة تحكم السوبر أدمن)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform_settings (
  id SERIAL PRIMARY KEY,
  trial_days INTEGER DEFAULT 14,
  support_email TEXT,
  support_phone TEXT,
  maintenance_mode BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscription_plans (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  name_en TEXT,
  description TEXT,
  price_monthly NUMERIC DEFAULT 0,
  price_yearly NUMERIC DEFAULT 0,
  currency TEXT DEFAULT 'YER',
  max_users INTEGER DEFAULT 5,
  max_branches INTEGER DEFAULT 1,
  max_products INTEGER DEFAULT 1000,
  trial_days INTEGER DEFAULT 14,
  is_active BOOLEAN DEFAULT true,
  features TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenant_subscriptions (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_code TEXT DEFAULT 'growth',
  status TEXT DEFAULT 'trial',
  billing_cycle TEXT DEFAULT 'monthly',
  trial_starts_at TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  subscription_starts_at TIMESTAMPTZ,
  subscription_ends_at TIMESTAMPTZ,
  amount NUMERIC DEFAULT 0,
  currency TEXT DEFAULT 'YER',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tenant_sub_tenant ON tenant_subscriptions(tenant_id);

CREATE TABLE IF NOT EXISTS subscription_payments (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  currency TEXT DEFAULT 'YER',
  method TEXT DEFAULT 'bank_transfer',
  status TEXT DEFAULT 'pending',
  reference TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sub_payments_tenant ON subscription_payments(tenant_id);

CREATE TABLE IF NOT EXISTS platform_announcements (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  title_en TEXT,
  body TEXT NOT NULL,
  type TEXT DEFAULT 'info',
  is_active BOOLEAN DEFAULT true,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform_payment_methods (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  name_en TEXT,
  type TEXT DEFAULT 'bank',
  account_name TEXT,
  account_number TEXT,
  iban TEXT,
  instructions TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS device_bindings (
  id SERIAL PRIMARY KEY,
  device_id TEXT NOT NULL,
  tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
  owner_email TEXT,
  owner_name TEXT,
  store_name TEXT,
  trial_used BOOLEAN DEFAULT true,
  status TEXT DEFAULT 'active',
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_device_bindings_device ON device_bindings(device_id);
CREATE INDEX IF NOT EXISTS idx_device_bindings_tenant ON device_bindings(tenant_id);

-- ---------------------------------------------------------------------------
-- Seed minimal platform data (idempotent)
-- ---------------------------------------------------------------------------
INSERT INTO platform_settings (id, trial_days, support_email) 
VALUES (1, 14, 'support@rafd.app')
ON CONFLICT (id) DO NOTHING;

INSERT INTO subscription_plans (code, name, name_en, description, price_monthly, price_yearly, max_users, max_branches, max_products, trial_days, is_active)
VALUES 
  ('starter', 'البداية', 'Starter', 'متجر صغير - فرع واحد', 9900, 99000, 2, 1, 500, 14, true),
  ('growth', 'النمو', 'Growth', 'الأكثر شعبية - 3 فروع', 19900, 199000, 5, 3, 2000, 14, true),
  ('scale', 'التوسع', 'Scale', 'شبكة متاجر - فروع غير محدودة', 39900, 399000, 20, 999, 10000, 14, true)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- DONE - Base schema ready for P0/P1/P2 migrations
-- ---------------------------------------------------------------------------
