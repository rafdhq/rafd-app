DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tenant_subscriptions_tenant_id_key'
  ) THEN
    ALTER TABLE tenant_subscriptions ADD CONSTRAINT tenant_subscriptions_tenant_id_key UNIQUE (tenant_id);
  END IF;
END $$;
