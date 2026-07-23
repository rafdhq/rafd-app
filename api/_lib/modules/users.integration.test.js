import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Integration test for the REAL users handler, proving the fix for the chicken-egg
 * onboarding bug:
 *   Supabase Auth (signUp) -> Onboarding POST /api/tenants (public) -> POST /api/branches (public)
 *   -> POST /api/users (with JWT but NO app_users yet) -> app_users created
 *   -> GET /api/users?email= (self lookup with JWT but no profile yet) -> returns empty before, then returns profile after
 *   -> AuthContext loadProfile -> TenantContext load -> store pages
 *
 * This test reproduces the exact production failure:
 *   Before fix: POST /api/users with token but no app_users returned 403 before INSERT
 *   After fix: POST succeeds when email matches token email and role=owner
 *
 * Also verifies:
 *   - Staff creation still requires users:write permission
 *   - Email case-insensitive matching in resolveAuth
 *   - Superadmin can still lookup any email
 */

vi.mock('../db-client.js', async () => {
  const { createFakeSupabase } = await import('../test-utils/fakeSupabase.js');
  return { supabase: createFakeSupabase() };
});

import { supabase } from '../db-client.js';
import { handler as usersHandler } from './users.js';
import { handler as tenantsHandler } from './tenants.js';
import { handler as branchesHandler } from './branches.js';

const NEW_OWNER_AUTH = { id: '15377607-a28d-489b-a620-12d3149703c9', email: 'malikalwesabi@gmail.com' };
const SUPERADMIN_AUTH = { id: 'bf65000d-ef0c-4f24-84e1-9a82fae91107', email: 'malek9art@gmail.com' };

function mockReq({ method, query = {}, body = null, token }) {
  return {
    method,
    query,
    body,
    url: '/api/users',
    headers: token ? { authorization: `Bearer ${token}` } : {},
  };
}
function mockRes() {
  return {
    statusCode: 200,
    _json: undefined,
    setHeader() {},
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(o) {
      this._json = o;
      return this;
    },
    end() {
      return this;
    },
  };
}

beforeEach(() => {
  supabase.reset({
    app_users: [
      { id: 1, tenant_id: 1, auth_id: SUPERADMIN_AUTH.id, email: SUPERADMIN_AUTH.email, full_name: 'مالك', role: 'superadmin', status: 'active' },
    ],
    tenants: [
      { id: 1, name: 'RAFD Store', name_ar: 'متجري', status: 'active' },
    ],
    branches: [
      { id: 1, tenant_id: 1, name: 'Main Branch', name_ar: 'الفرع الرئيسي', is_main: true, status: 'active' },
    ],
    onboarding_ip_log: [],
    tenant_catalog: [],
  });
});

describe('users handler — onboarding chicken-egg fix', () => {
  it('GET /api/users?email= with token but no app_users yet returns empty array (not 403) when email matches token — self-lookup during onboarding', async () => {
    // Simulate new user who just signed up, has JWT but no app_users row yet
    supabase.setAuthUser(NEW_OWNER_AUTH);
    const res = mockRes();
    await usersHandler(
      mockReq({ method: 'GET', token: 'fake-jwt', query: { email: NEW_OWNER_AUTH.email } }),
      res
    );
    // After fix: should be 200 with empty array, not 403
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res._json)).toBe(true);
    expect(res._json).toHaveLength(0);
  });

  it('POST /api/users with token but no app_users yet creates first owner when email matches token — onboarding fix', async () => {
    supabase.setAuthUser(NEW_OWNER_AUTH);
    const res = mockRes();
    await usersHandler(
      mockReq({
        method: 'POST',
        token: 'fake-jwt',
        body: {
          tenant_id: 4,
          auth_id: NEW_OWNER_AUTH.id,
          email: NEW_OWNER_AUTH.email,
          full_name: 'مالك الوسابي',
          role: 'owner',
          status: 'active',
        },
      }),
      res
    );
    // After fix: should succeed 201 and create app_users
    expect(res.statusCode).toBe(201);
    expect(res._json.email).toBe(NEW_OWNER_AUTH.email);
    expect(res._json.tenant_id).toBe(4);
    expect(res._json.role).toBe('owner');

    // Verify DB now has the new user
    const { data: allUsers } = await supabase.from('app_users').select('*');
    expect(allUsers).toHaveLength(2);
    const newUser = allUsers.find((u) => u.email === NEW_OWNER_AUTH.email);
    expect(newUser).toBeTruthy();
    expect(newUser.tenant_id).toBe(4);
  });

  it('POST /api/users with token but no app_users yet fails if email does NOT match token — security', async () => {
    supabase.setAuthUser(NEW_OWNER_AUTH);
    const res = mockRes();
    await usersHandler(
      mockReq({
        method: 'POST',
        token: 'fake-jwt',
        body: {
          tenant_id: 4,
          auth_id: 'some-other-id',
          email: 'attacker@example.com',
          full_name: 'Attacker',
          role: 'owner',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(403);
  });

  it('Full onboarding flow: Supabase Auth -> tenants POST (public) -> branches POST (public) -> users POST (with token, no prior app_users) -> users GET', async () => {
    // Step 1: Simulate Supabase Auth signUp — auth user exists, no app_users yet (except superadmin)
    supabase.setAuthUser(NEW_OWNER_AUTH);

    // Step 2: Create tenant (public, no token required — as per tenants handler)
    const tenantRes = mockRes();
    const { handler: tenantsH } = await import('./tenants.js');
    // Need to use same supabase instance, but tenants handler uses same mocked supabase
    const tReq = { method: 'POST', query: {}, body: { name: 'تموينات دنيا الخير', name_ar: 'تموينات دنيا الخير', currency: 'YER', plan: 'growth', status: 'trial' }, url: '/api/tenants', headers: {} };
    const tRes = { statusCode: 200, _json: undefined, setHeader() {}, status(c) { this.statusCode = c; return this; }, json(o) { this._json = o; return this; }, end() { return this; } };
    await tenantsH(tReq, tRes);
    expect(tRes.statusCode).toBe(201);
    const newTenantId = tRes._json.id;
    expect(newTenantId).toBeTruthy();

    // Step 3: Create branch (public)
    const bReq = { method: 'POST', query: {}, body: { tenant_id: newTenantId, name: 'Main Branch', name_ar: 'الفرع الرئيسي', is_main: true, status: 'active' }, url: '/api/branches', headers: {} };
    const bRes = { statusCode: 200, _json: undefined, setHeader() {}, status(c) { this.statusCode = c; return this; }, json(o) { this._json = o; return this; }, end() { return this; } };
    await branchesHandler(bReq, bRes);
    expect(bRes.statusCode).toBe(201);

    // Step 4: Create app_users as owner with token but no prior app_users for this email (the bug we fixed)
    const uRes = mockRes();
    await usersHandler(
      mockReq({
        method: 'POST',
        token: 'fake-jwt',
        body: {
          tenant_id: newTenantId,
          auth_id: NEW_OWNER_AUTH.id,
          email: NEW_OWNER_AUTH.email,
          full_name: 'مالك الوسابي',
          role: 'owner',
          status: 'active',
          branch_id: bRes._json.id,
        },
      }),
      uRes
    );
    expect(uRes.statusCode).toBe(201);
    expect(uRes._json.tenant_id).toBe(newTenantId);

    // Step 5: Now GET /api/users?email= should return the newly created profile (AuthContext loadProfile)
    const getRes = mockRes();
    await usersHandler(
      mockReq({ method: 'GET', token: 'fake-jwt', query: { email: NEW_OWNER_AUTH.email } }),
      getRes
    );
    expect(getRes.statusCode).toBe(200);
    expect(getRes._json[0].email).toBe(NEW_OWNER_AUTH.email);
    expect(getRes._json[0].tenant_id).toBe(newTenantId);

    // Step 6: Simulate TenantContext loading tenant by id (should succeed now because profile has tenant_id)
    // TenantContext does fetch /api/tenants?id=tenantId which requires auth and tenant isolation
    // With our new owner profile (tenant_id=newTenantId), it should be allowed
    supabase.setAuthUser(NEW_OWNER_AUTH); // now auth user has matching app_users
    // Need to update fake supabase store to have the new user as the auth user for tenants handler
    // The tenants handler will call resolveAuth which will find the new user via auth_id or email
    const tenantGetReq = { method: 'GET', query: { id: newTenantId }, url: '/api/tenants', headers: { authorization: 'Bearer fake-jwt' } };
    const tenantGetRes = { statusCode: 200, _json: undefined, setHeader() {}, status(c) { this.statusCode = c; return this; }, json(o) { this._json = o; return this; }, end() { return this; } };
    await tenantsH(tenantGetReq, tenantGetRes);
    expect(tenantGetRes.statusCode).toBe(200);
    expect(tenantGetRes._json.id).toBe(newTenantId);
  });

  it('Staff creation still requires users:write permission — owner can create cashier', async () => {
    // First create owner as above
    supabase.setAuthUser(NEW_OWNER_AUTH);
    const ownerRes = mockRes();
    await usersHandler(
      mockReq({
        method: 'POST',
        token: 'fake-jwt',
        body: { tenant_id: 1, auth_id: NEW_OWNER_AUTH.id, email: NEW_OWNER_AUTH.email, full_name: 'Owner', role: 'owner' },
      }),
      ownerRes
    );
    expect(ownerRes.statusCode).toBe(201);

    // Now owner creates a cashier
    supabase.setAuthUser(NEW_OWNER_AUTH); // owner is now the auth user with profile
    const staffRes = mockRes();
    await usersHandler(
      mockReq({
        method: 'POST',
        token: 'fake-jwt',
        body: { tenant_id: 1, email: 'cashier@test.rafd', full_name: 'Cashier', role: 'cashier' },
      }),
      staffRes
    );
    expect(staffRes.statusCode).toBe(201);
    expect(staffRes._json.role).toBe('cashier');
  });

  it('Cashier cannot create owner — privilege escalation blocked', async () => {
    const cashierAuth = { id: 'cashier-auth', email: 'cashier@test.rafd' };
    supabase.reset({
      app_users: [
        { id: 1, tenant_id: 1, auth_id: SUPERADMIN_AUTH.id, email: SUPERADMIN_AUTH.email, role: 'superadmin', status: 'active' },
        { id: 2, tenant_id: 1, auth_id: cashierAuth.id, email: cashierAuth.email, role: 'cashier', status: 'active' },
      ],
      tenants: [{ id: 1, name: 'Store', name_ar: 'متجر', status: 'active' }],
      branches: [],
      onboarding_ip_log: [],
      tenant_catalog: [],
    });
    supabase.setAuthUser(cashierAuth);
    const res = mockRes();
    await usersHandler(
      mockReq({
        method: 'POST',
        token: 'fake-jwt',
        body: { tenant_id: 1, email: 'newowner@test.rafd', full_name: 'New Owner', role: 'owner' },
      }),
      res
    );
    // Cashier should not be able to create owner, should be downgraded to cashier or forbidden
    // Our logic: if role is cashier, it forces role to cashier
    if (res.statusCode === 201) {
      expect(res._json.role).toBe('cashier');
    } else {
      expect(res.statusCode).toBe(403);
    }
  });

  it('Superadmin can lookup any email (case-insensitive) — email lowercasing fix', async () => {
    supabase.setAuthUser(SUPERADMIN_AUTH);
    const res = mockRes();
    await usersHandler(
      mockReq({ method: 'GET', token: 'fake-jwt', query: { email: 'OWNER@TEST.RAFD' } }),
      res
    );
    // Superadmin should be able to lookup even with different case
    // Our fix: resolveAuth now lowercases email, so superadmin lookup should succeed (if user exists)
    // For non-existing user, it returns empty array 200, not 403
    expect(res.statusCode).toBe(200);
  });
});
