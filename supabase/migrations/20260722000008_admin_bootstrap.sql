-- RAFD | رفد - Real Admin Bootstrap
-- ============================================================================
-- Links the REAL platform owner/super-admin to an existing Supabase Auth user
-- WITHOUT creating a new auth account.
--
--   Email : malek9art@gmail.com
--   UID   : bf65000d-ef0c-4f24-84e1-9a82fae91107  (auth.users.id)
--
-- This provisions every dependent system record automatically:
--   * a real (non-demo) store tenant
--   * a main branch
--   * the app_users profile (Owner + Super Admin) linked to the Auth UID
--   * an active subscription so the store is immediately usable
--
-- Fully idempotent: safe to run on every environment via `supabase db push`.
-- Root cause it fixes: app_users was empty, so resolveAuth() returned
-- "403 no app profile linked" for every /api/* call after login.
-- ============================================================================

DO $$
DECLARE
  v_tenant_id  integer;
  v_branch_id  integer;
  v_admin_email text := 'malek9art@gmail.com';
  v_admin_uid   text := 'bf65000d-ef0c-4f24-84e1-9a82fae91107';
BEGIN
  -- 1) Ensure a real store tenant exists (reuse the lowest existing id, else create).
  SELECT id INTO v_tenant_id FROM tenants ORDER BY id ASC LIMIT 1;

  IF v_tenant_id IS NULL THEN
    INSERT INTO tenants (name, name_ar, currency, plan, status, business_type)
    VALUES ('RAFD Store', 'متجري', 'YER', 'growth', 'active', 'grocery')
    RETURNING id INTO v_tenant_id;
  ELSE
    -- De-demo the tenant: activate it and drop the placeholder "تجريبي" name.
    UPDATE tenants
       SET status  = 'active',
           name    = CASE WHEN name IS NULL OR name = '' OR name = 'تجريبي'
                          THEN 'RAFD Store' ELSE name END,
           name_ar = CASE WHEN name_ar IS NULL OR name_ar = '' OR name_ar = 'تجريبي'
                          THEN 'متجري' ELSE name_ar END
     WHERE id = v_tenant_id;
  END IF;

  -- 2) Ensure a main branch exists for that tenant.
  SELECT id INTO v_branch_id
    FROM branches
   WHERE tenant_id = v_tenant_id
   ORDER BY is_main DESC, id ASC
   LIMIT 1;

  IF v_branch_id IS NULL THEN
    INSERT INTO branches (tenant_id, name, name_ar, is_main, status)
    VALUES (v_tenant_id, 'Main Branch', 'الفرع الرئيسي', true, 'active')
    RETURNING id INTO v_branch_id;
  END IF;

  -- 3) Upsert the REAL admin profile — Owner + Super Admin — linked to the Auth UID.
  --    superadmin carries ['*','platform:*'] so it is a super-set of owner.
  INSERT INTO app_users (tenant_id, auth_id, email, full_name, role, branch_id, status)
  VALUES (v_tenant_id, v_admin_uid, v_admin_email, 'مالك', 'superadmin', v_branch_id, 'active')
  ON CONFLICT (email) DO UPDATE
     SET tenant_id  = EXCLUDED.tenant_id,
         auth_id    = EXCLUDED.auth_id,
         role       = 'superadmin',
         branch_id  = EXCLUDED.branch_id,
         status     = 'active',
         updated_at = now();

  -- 4) Ensure an ACTIVE subscription so the store is never trial/subscription-locked.
  IF EXISTS (SELECT 1 FROM tenant_subscriptions WHERE tenant_id = v_tenant_id) THEN
    UPDATE tenant_subscriptions
       SET status = 'active', updated_at = now()
     WHERE tenant_id = v_tenant_id
       AND status <> 'active';
  ELSE
    INSERT INTO tenant_subscriptions (tenant_id, plan_code, status)
    VALUES (v_tenant_id, 'growth', 'active');
  END IF;
END $$;
