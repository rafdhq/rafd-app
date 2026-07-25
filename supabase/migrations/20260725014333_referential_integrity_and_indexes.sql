-- RAFD | رفد - Referential integrity hardening + missing tenant_id indexes (P1/P2)
-- ============================================================================
-- Adds FK constraints for relationship columns that were never enforced at the
-- DB level, and covering indexes on tenant_id for feature tables that lacked
-- one. Verified against live data before writing: zero orphan rows on every
-- column below, so every ADD CONSTRAINT below is safe to run as-is.
-- Idempotent: safe to run on every environment.
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_conversations_tenant_id_fkey') THEN ALTER TABLE ai_conversations ADD CONSTRAINT ai_conversations_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_conversations_user_id_fkey') THEN ALTER TABLE ai_conversations ADD CONSTRAINT ai_conversations_user_id_fkey FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE SET NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'branch_price_overrides_tenant_id_fkey') THEN ALTER TABLE branch_price_overrides ADD CONSTRAINT branch_price_overrides_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'branch_price_overrides_branch_id_fkey') THEN ALTER TABLE branch_price_overrides ADD CONSTRAINT branch_price_overrides_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'branch_price_overrides_product_id_fkey') THEN ALTER TABLE branch_price_overrides ADD CONSTRAINT branch_price_overrides_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'branch_price_overrides_price_list_id_fkey') THEN ALTER TABLE branch_price_overrides ADD CONSTRAINT branch_price_overrides_price_list_id_fkey FOREIGN KEY (price_list_id) REFERENCES price_lists(id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cashier_shifts_tenant_id_fkey') THEN ALTER TABLE cashier_shifts ADD CONSTRAINT cashier_shifts_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cashier_shifts_branch_id_fkey') THEN ALTER TABLE cashier_shifts ADD CONSTRAINT cashier_shifts_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cashier_shifts_user_id_fkey') THEN ALTER TABLE cashier_shifts ADD CONSTRAINT cashier_shifts_user_id_fkey FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE SET NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_price_overrides_tenant_id_fkey') THEN ALTER TABLE customer_price_overrides ADD CONSTRAINT customer_price_overrides_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_price_overrides_customer_id_fkey') THEN ALTER TABLE customer_price_overrides ADD CONSTRAINT customer_price_overrides_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_price_overrides_product_id_fkey') THEN ALTER TABLE customer_price_overrides ADD CONSTRAINT customer_price_overrides_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'loyalty_ledger_tenant_id_fkey') THEN ALTER TABLE loyalty_ledger ADD CONSTRAINT loyalty_ledger_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'loyalty_ledger_customer_id_fkey') THEN ALTER TABLE loyalty_ledger ADD CONSTRAINT loyalty_ledger_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'loyalty_ledger_sale_id_fkey') THEN ALTER TABLE loyalty_ledger ADD CONSTRAINT loyalty_ledger_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE SET NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'loyalty_offers_tenant_id_fkey') THEN ALTER TABLE loyalty_offers ADD CONSTRAINT loyalty_offers_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'loyalty_programs_tenant_id_fkey') THEN ALTER TABLE loyalty_programs ADD CONSTRAINT loyalty_programs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'manufacturing_orders_tenant_id_fkey') THEN ALTER TABLE manufacturing_orders ADD CONSTRAINT manufacturing_orders_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'manufacturing_orders_branch_id_fkey') THEN ALTER TABLE manufacturing_orders ADD CONSTRAINT manufacturing_orders_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'manufacturing_orders_recipe_id_fkey') THEN ALTER TABLE manufacturing_orders ADD CONSTRAINT manufacturing_orders_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE SET NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'manufacturing_orders_product_id_fkey') THEN ALTER TABLE manufacturing_orders ADD CONSTRAINT manufacturing_orders_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'price_lists_tenant_id_fkey') THEN ALTER TABLE price_lists ADD CONSTRAINT price_lists_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_prices_tenant_id_fkey') THEN ALTER TABLE product_prices ADD CONSTRAINT product_prices_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_prices_product_id_fkey') THEN ALTER TABLE product_prices ADD CONSTRAINT product_prices_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_prices_price_list_id_fkey') THEN ALTER TABLE product_prices ADD CONSTRAINT product_prices_price_list_id_fkey FOREIGN KEY (price_list_id) REFERENCES price_lists(id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_subscriptions_tenant_id_fkey') THEN ALTER TABLE push_subscriptions ADD CONSTRAINT push_subscriptions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_subscriptions_user_id_fkey') THEN ALTER TABLE push_subscriptions ADD CONSTRAINT push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE SET NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recipes_tenant_id_fkey') THEN ALTER TABLE recipes ADD CONSTRAINT recipes_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recipes_product_id_fkey') THEN ALTER TABLE recipes ADD CONSTRAINT recipes_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recipe_items_tenant_id_fkey') THEN ALTER TABLE recipe_items ADD CONSTRAINT recipe_items_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recipe_items_recipe_id_fkey') THEN ALTER TABLE recipe_items ADD CONSTRAINT recipe_items_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recipe_items_ingredient_product_id_fkey') THEN ALTER TABLE recipe_items ADD CONSTRAINT recipe_items_ingredient_product_id_fkey FOREIGN KEY (ingredient_product_id) REFERENCES products(id) ON DELETE SET NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refunds_tenant_id_fkey') THEN ALTER TABLE refunds ADD CONSTRAINT refunds_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refunds_sale_id_fkey') THEN ALTER TABLE refunds ADD CONSTRAINT refunds_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refunds_user_id_fkey') THEN ALTER TABLE refunds ADD CONSTRAINT refunds_user_id_fkey FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE SET NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refund_items_refund_id_fkey') THEN ALTER TABLE refund_items ADD CONSTRAINT refund_items_refund_id_fkey FOREIGN KEY (refund_id) REFERENCES refunds(id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refund_items_sale_item_id_fkey') THEN ALTER TABLE refund_items ADD CONSTRAINT refund_items_sale_item_id_fkey FOREIGN KEY (sale_item_id) REFERENCES sale_items(id) ON DELETE SET NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refund_items_product_id_fkey') THEN ALTER TABLE refund_items ADD CONSTRAINT refund_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stocktake_sessions_tenant_id_fkey') THEN ALTER TABLE stocktake_sessions ADD CONSTRAINT stocktake_sessions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stocktake_sessions_branch_id_fkey') THEN ALTER TABLE stocktake_sessions ADD CONSTRAINT stocktake_sessions_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stocktake_sessions_user_id_fkey') THEN ALTER TABLE stocktake_sessions ADD CONSTRAINT stocktake_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE SET NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stocktake_lines_session_id_fkey') THEN ALTER TABLE stocktake_lines ADD CONSTRAINT stocktake_lines_session_id_fkey FOREIGN KEY (session_id) REFERENCES stocktake_sessions(id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stocktake_lines_product_id_fkey') THEN ALTER TABLE stocktake_lines ADD CONSTRAINT stocktake_lines_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_invites_tenant_id_fkey') THEN ALTER TABLE user_invites ADD CONSTRAINT user_invites_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_outbox_tenant_id_fkey') THEN ALTER TABLE whatsapp_outbox ADD CONSTRAINT whatsapp_outbox_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_outbox_user_id_fkey') THEN ALTER TABLE whatsapp_outbox ADD CONSTRAINT whatsapp_outbox_user_id_fkey FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE SET NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_supplier_id_fkey') THEN ALTER TABLE products ADD CONSTRAINT products_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_bank_account_id_fkey') THEN ALTER TABLE sales ADD CONSTRAINT sales_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id) ON DELETE SET NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_logs_user_id_fkey') THEN ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE SET NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'backups_user_id_fkey') THEN ALTER TABLE backups ADD CONSTRAINT backups_user_id_fkey FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE SET NULL; END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_ai_conversations_tenant ON ai_conversations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_branch_price_overrides_tenant ON branch_price_overrides(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customer_price_overrides_tenant ON customer_price_overrides(tenant_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_tenant ON loyalty_ledger(tenant_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_offers_tenant ON loyalty_offers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_programs_tenant ON loyalty_programs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_price_lists_tenant ON price_lists(tenant_id);
CREATE INDEX IF NOT EXISTS idx_product_prices_tenant ON product_prices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_tenant ON push_subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_recipe_items_tenant ON recipe_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_recipes_tenant ON recipes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_invites_tenant ON user_invites(tenant_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_outbox_tenant ON whatsapp_outbox(tenant_id);
CREATE INDEX IF NOT EXISTS idx_app_users_branch ON app_users(branch_id);
CREATE INDEX IF NOT EXISTS idx_expenses_branch ON expenses(branch_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_product ON purchase_items(product_id);
CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON purchases(supplier_id);
CREATE INDEX IF NOT EXISTS idx_sales_branch ON sales(branch_id);
CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_supplier_ledger_supplier ON supplier_ledger(supplier_id);
-- ---------------------------------------------------------------------------
-- Covering indexes for every FK column added above (advisor-verified: zero
-- remaining "unindexed foreign keys" warnings after this).
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_ai_conversations_user ON ai_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_backups_user ON backups(user_id);
CREATE INDEX IF NOT EXISTS idx_branch_price_overrides_branch ON branch_price_overrides(branch_id);
CREATE INDEX IF NOT EXISTS idx_branch_price_overrides_price_list ON branch_price_overrides(price_list_id);
CREATE INDEX IF NOT EXISTS idx_branch_price_overrides_product ON branch_price_overrides(product_id);
CREATE INDEX IF NOT EXISTS idx_cashier_shifts_branch ON cashier_shifts(branch_id);
CREATE INDEX IF NOT EXISTS idx_cashier_shifts_user ON cashier_shifts(user_id);
CREATE INDEX IF NOT EXISTS idx_customer_price_overrides_customer ON customer_price_overrides(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_price_overrides_product ON customer_price_overrides(product_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_customer ON loyalty_ledger(customer_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_sale ON loyalty_ledger(sale_id);
CREATE INDEX IF NOT EXISTS idx_manufacturing_orders_branch ON manufacturing_orders(branch_id);
CREATE INDEX IF NOT EXISTS idx_manufacturing_orders_product ON manufacturing_orders(product_id);
CREATE INDEX IF NOT EXISTS idx_manufacturing_orders_recipe ON manufacturing_orders(recipe_id);
CREATE INDEX IF NOT EXISTS idx_product_prices_price_list ON product_prices(price_list_id);
CREATE INDEX IF NOT EXISTS idx_products_supplier ON products(supplier_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_recipe_items_ingredient_product ON recipe_items(ingredient_product_id);
CREATE INDEX IF NOT EXISTS idx_refund_items_product ON refund_items(product_id);
CREATE INDEX IF NOT EXISTS idx_refund_items_refund ON refund_items(refund_id);
CREATE INDEX IF NOT EXISTS idx_refund_items_sale_item ON refund_items(sale_item_id);
CREATE INDEX IF NOT EXISTS idx_refunds_sale ON refunds(sale_id);
CREATE INDEX IF NOT EXISTS idx_refunds_user ON refunds(user_id);
CREATE INDEX IF NOT EXISTS idx_sales_bank_account ON sales(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_stocktake_lines_product ON stocktake_lines(product_id);
CREATE INDEX IF NOT EXISTS idx_stocktake_lines_session ON stocktake_lines(session_id);
CREATE INDEX IF NOT EXISTS idx_stocktake_sessions_branch ON stocktake_sessions(branch_id);
CREATE INDEX IF NOT EXISTS idx_stocktake_sessions_user ON stocktake_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_payments_payment_method ON subscription_payments(payment_method_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_outbox_user ON whatsapp_outbox(user_id);
