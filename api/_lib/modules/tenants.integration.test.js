import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Integration test for the REAL tenants handler, proving:
 *  - BL-01: GET/PUT now require auth + tenant isolation (POST stays public).
 *  - The Settings.tsx logo-upload chain (upload -> logo_url -> PUT /api/tenants
 *    -> GET /api/tenants) still round-trips correctly after the BL-01 change —
 *    i.e. securing the endpoint did not break the feature it protects.
 */

vi.mock('../db-client.js', async () => {
  const { createFakeSupabase } = await import('../test-utils/fakeSupabase.js');
  return { supabase: createFakeSupabase() };
});

import { supabase } from '../db-client.js';
import { handler } from './tenants.js';

const OWNER_AUTH = { id: 'auth-owner-1', email: 'owner@test.rafd' };
const OTHER_OWNER_AUTH = { id: 'auth-owner-2', email: 'owner2@test.rafd' };

function mockReq({ method, query = {}, body = null, token }) {
  return { method, query, body, url: '/api/tenants', headers: token ? { authorization: `Bearer ${token}` } : {} };
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
    tenants: [
      { id: 1, name: 'Store A', name_ar: 'متجر أ', logo_url: null },
      { id: 2, name: 'Store B', name_ar: 'متجر ب', logo_url: null },
    ],
    app_users: [
      { id: 1, tenant_id: 1, auth_id: OWNER_AUTH.id, email: OWNER_AUTH.email, role: 'owner', status: 'active' },
      { id: 2, tenant_id: 2, auth_id: OTHER_OWNER_AUTH.id, email: OTHER_OWNER_AUTH.email, role: 'owner', status: 'active' },
    ],
    onboarding_ip_log: [],
    tenant_catalog: [],
  });
});

describe('tenants handler — BL-01 auth + logo persistence', () => {
  it('GET without a token is rejected (401) — was fully open before BL-01', async () => {
    const res = mockRes();
    await handler(mockReq({ method: 'GET', query: {} }), res);
    expect(res.statusCode).toBe(401);
  });

  it('PUT without a token is rejected (401)', async () => {
    const res = mockRes();
    await handler(mockReq({ method: 'PUT', body: { id: 1, logo_url: 'https://x/logo.png' } }), res);
    expect(res.statusCode).toBe(401);
  });

  it('logo save round-trip: PUT sets logo_url, GET by id returns it back (Settings.tsx flow)', async () => {
    supabase.setAuthUser(OWNER_AUTH);
    const putRes = mockRes();
    await handler(mockReq({ method: 'PUT', token: 't', body: { id: 1, logo_url: 'https://fake-storage.local/rafd-media/tenants/1/logo/1-logo.png' } }), putRes);
    expect(putRes.statusCode).toBe(200);
    expect(putRes._json.logo_url).toContain('/tenants/1/logo/');

    const getRes = mockRes();
    await handler(mockReq({ method: 'GET', token: 't', query: { id: 1 } }), getRes);
    expect(getRes.statusCode).toBe(200);
    expect(getRes._json.logo_url).toBe(putRes._json.logo_url);
  });

  it('an owner cannot PUT (edit) a different tenant\'s row', async () => {
    supabase.setAuthUser(OWNER_AUTH); // owner of tenant 1
    const res = mockRes();
    await handler(mockReq({ method: 'PUT', token: 't', body: { id: 2, logo_url: 'https://evil/x.png' } }), res);
    expect(res.statusCode).toBe(403);
  });

  it('an owner listing GET(all) sees only their own tenant, not every store on the platform', async () => {
    supabase.setAuthUser(OWNER_AUTH);
    const res = mockRes();
    await handler(mockReq({ method: 'GET', token: 't', query: {} }), res);
    expect(res.statusCode).toBe(200);
    expect(res._json).toHaveLength(1);
    expect(res._json[0].id).toBe(1);
  });

  it('POST (onboarding store creation) stays public — no token required', async () => {
    const res = mockRes();
    await handler(
      mockReq({
        method: 'POST',
        body: { name: 'New Store', name_ar: 'متجر جديد', currency: 'YER', plan: 'growth', status: 'trial' },
      }),
      res
    );
    expect(res.statusCode).toBe(201);
    expect(res._json.name_ar).toBe('متجر جديد');
  });
});
