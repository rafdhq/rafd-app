import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Integration test for the REAL upload handler proving the full chain:
 *   Frontend payload shape -> API (auth+permission) -> Storage -> public URL.
 *
 * Same rationale as products.integration.test.js for using an in-memory fake
 * Supabase client instead of the live project (this sandbox's egress proxy
 * denies direct HTTPS to the Supabase host). The bucket's real RLS policies
 * (rafd-media, public-read / authenticated-write) were separately verified
 * live via Supabase MCP and hardened in
 * supabase/migrations/20260722000011_storage_media_policy_hardening.sql.
 */

vi.mock('../db-client.js', async () => {
  const { createFakeSupabase } = await import('../test-utils/fakeSupabase.js');
  return { supabase: createFakeSupabase() };
});

import { supabase } from '../db-client.js';
import { handler } from './upload.js';

const OWNER_AUTH = { id: 'auth-owner-1', email: 'owner@test.rafd' };
// 1x1 transparent PNG, matches what compressAndEncode() would produce client-side.
const PNG_1x1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function mockReq({ method, query = {}, body = null, token }) {
  return { method, query, body, url: '/api/upload', headers: token ? { authorization: `Bearer ${token}` } : {} };
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
    tenants: [{ id: 1, name: 'Tenant A' }],
    app_users: [{ id: 1, tenant_id: 1, auth_id: OWNER_AUTH.id, email: OWNER_AUTH.email, role: 'owner', status: 'active' }],
  });
  supabase.setAuthUser(OWNER_AUTH);
});

describe('upload handler — Frontend -> API -> Storage -> public URL', () => {
  it('product image: uploads to the tenant-scoped folder and returns a usable public URL', async () => {
    const res = mockRes();
    await handler(
      mockReq({
        method: 'POST',
        token: 't',
        body: {
          fileName: 'product.png',
          fileBase64: PNG_1x1,
          contentType: 'image/png',
          folder: 'products/1',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res._json.url).toContain('/rafd-media/');
    expect(res._json.url).toContain('products/1/');
    expect(res._json.path).toMatch(/^products\/1\//);
    expect(supabase._uploaded).toHaveLength(1);
    expect(supabase._uploaded[0].bucket).toBe('rafd-media');
  });

  it('tenant logo: uploads to the tenant logo folder', async () => {
    const res = mockRes();
    await handler(
      mockReq({
        method: 'POST',
        token: 't',
        body: {
          fileName: 'logo.png',
          fileBase64: PNG_1x1,
          contentType: 'image/png',
          folder: 'tenants/1/logo',
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res._json.path).toMatch(/^tenants\/1\/logo\//);
  });

  it('rejects a file larger than the server-side size guard', async () => {
    const bigBase64 = Buffer.alloc(3_000_000, 1).toString('base64'); // > default 2.5MB guard
    const res = mockRes();
    await handler(
      mockReq({
        method: 'POST',
        token: 't',
        body: { fileName: 'huge.png', fileBase64: bigBase64, contentType: 'image/png' },
      }),
      res
    );
    expect(res.statusCode).toBe(413);
    expect(supabase._uploaded).toHaveLength(0);
  });

  it('sanitizes unsafe characters out of the file name', async () => {
    const res = mockRes();
    await handler(
      mockReq({
        method: 'POST',
        token: 't',
        body: { fileName: '../../evil name!.png', fileBase64: PNG_1x1, contentType: 'image/png' },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res._json.path).not.toMatch(/\.\.\//);
    expect(res._json.path).not.toMatch(/[! ]/);
  });

  it('rejects an unauthenticated request', async () => {
    const res = mockRes();
    await handler(mockReq({ method: 'POST', body: { fileName: 'x.png', fileBase64: PNG_1x1 } }), res);
    expect(res.statusCode).toBe(401);
  });
});
