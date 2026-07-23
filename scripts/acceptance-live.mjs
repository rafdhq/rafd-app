/**
 * Live acceptance test against rafd-dev.
 *
 * Exercises the REAL API module handlers (auth + tenant isolation + products +
 * upload) in-process, using a genuine Supabase JWT minted for the real admin
 * account (malek9art@gmail.com) via admin generateLink + verifyOtp — no new auth
 * user, no password change. All test artifacts are cleaned up.
 *
 * Run: node scripts/acceptance-live.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { handler as productsHandler } from '../api/_lib/modules/products.js';
import { handler as usersHandler } from '../api/_lib/modules/users.js';
import { handler as uploadHandler } from '../api/_lib/modules/upload.js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAIL = 'malek9art@gmail.com';

let pass = 0;
let fail = 0;
const log = (ok, msg, extra = '') => {
  console.log(`${ok ? '✅ PASS' : '❌ FAIL'}  ${msg}${extra ? '  — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

function mockReq({ method, query = {}, body = null, token }) {
  return {
    method,
    query,
    body,
    url: '/api/test',
    headers: token ? { authorization: `Bearer ${token}` } : {},
  };
}
function mockRes() {
  return {
    statusCode: 200,
    _json: undefined,
    setHeader() {},
    status(c) { this.statusCode = c; return this; },
    json(o) { this._json = o; return this; },
    end() { return this; },
  };
}

async function mintAdminToken() {
  const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: ADMIN_EMAIL,
  });
  if (error) throw new Error('generateLink failed: ' + error.message);
  const tokenHash = data?.properties?.hashed_token;
  if (!tokenHash) throw new Error('no hashed_token from generateLink');

  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: v, error: vErr } = await anon.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'email',
  });
  if (vErr) throw new Error('verifyOtp failed: ' + vErr.message);
  if (!v?.session?.access_token) throw new Error('no access_token from verifyOtp');
  return v.session.access_token;
}

// 1x1 transparent PNG
const PNG_1x1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

async function main() {
  if (!URL || !ANON || !SERVICE) {
    console.error('Missing Supabase env (URL/ANON/SERVICE).');
    process.exit(2);
  }
  const service = createClient(URL, SERVICE, { auth: { persistSession: false } });

  let token;
  try {
    token = await mintAdminToken();
    log(true, 'Mint real JWT for admin (generateLink+verifyOtp)');
  } catch (e) {
    log(false, 'Mint real JWT for admin', e.message);
    console.log('\nCannot continue without a token.');
    process.exit(1);
  }

  // A) users?email — profile bootstrap resolves the linked superadmin profile
  {
    const res = mockRes();
    await usersHandler(mockReq({ method: 'GET', query: { email: ADMIN_EMAIL }, token }), res);
    const row = Array.isArray(res._json) ? res._json[0] : res._json;
    log(
      res.statusCode === 200 && row?.email === ADMIN_EMAIL && row?.role === 'superadmin' && !!row?.tenant_id,
      'GET /api/users?email resolves admin profile (Owner+SuperAdmin, tenant linked)',
      `status=${res.statusCode} role=${row?.role} tenant=${row?.tenant_id}`
    );
  }

  // B) products GET — no more 403; returns an array scoped to tenant 1
  {
    const res = mockRes();
    await productsHandler(mockReq({ method: 'GET', query: { tenant_id: 1 }, token }), res);
    log(
      res.statusCode === 200 && Array.isArray(res._json),
      'GET /api/products returns list (was 403 before fix)',
      `status=${res.statusCode} count=${Array.isArray(res._json) ? res._json.length : 'n/a'}`
    );
  }

  // C) products POST — create, then verify it appears (display path)
  let createdId = null;
  {
    const res = mockRes();
    await productsHandler(
      mockReq({
        method: 'POST',
        query: {},
        body: {
          tenant_id: 1,
          name: 'ACCEPTANCE TEST ITEM',
          name_ar: 'صنف اختبار القبول',
          sku: `ACC-${Date.now()}`,
          barcode: '',
          category: 'بقالة',
          price: 100,
          carton_cost: 1200,
          units_per_carton: 12,
          cartons: 2,
          min_stock: 5,
          unit: 'حبة',
          image_url: 'emoji:🛒',
          is_active: true,
        },
        token,
      }),
      res
    );
    createdId = res._json?.id ?? null;
    log(
      res.statusCode === 201 && createdId != null && Number(res._json?.stock) === 24,
      'POST /api/products creates product with packaging (2 cartons × 12 = 24)',
      `status=${res.statusCode} id=${createdId} stock=${res._json?.stock}`
    );
  }

  // D) products GET again — new product is visible + search works
  {
    const res = mockRes();
    await productsHandler(mockReq({ method: 'GET', query: { tenant_id: 1, q: 'اختبار' }, token }), res);
    const found = Array.isArray(res._json) && res._json.some((p) => p.id === createdId);
    log(found, 'GET /api/products?q= finds the new product (search works)', `matches=${Array.isArray(res._json) ? res._json.length : 'n/a'}`);
  }

  // E) upload — image goes to Storage and returns a public URL (image path)
  let uploadedPath = null;
  {
    const res = mockRes();
    await uploadHandler(
      mockReq({
        method: 'POST',
        query: {},
        body: {
          tenant_id: 1,
          fileName: 'acceptance.png',
          fileBase64: PNG_1x1,
          contentType: 'image/png',
          folder: 'products/1/acceptance',
        },
        token,
      }),
      res
    );
    uploadedPath = res._json?.path ?? null;
    const url = res._json?.url;
    log(
      res.statusCode === 200 && typeof url === 'string' && url.includes('/rafd-media/'),
      'POST /api/upload stores image in Storage and returns public URL',
      `status=${res.statusCode} url=${url ? url.slice(0, 60) + '…' : 'n/a'}`
    );
  }

  // F) tenant isolation — a foreign tenant_id must be rejected for scoped writes
  {
    const res = mockRes();
    await productsHandler(
      mockReq({
        method: 'GET',
        query: { tenant_id: 999999 },
        token,
      }),
      res
    );
    // admin is superadmin → allowed to query any tenant; expect empty array, not a leak of tenant 1
    const isolated = res.statusCode === 200 && Array.isArray(res._json) && res._json.every((p) => p.tenant_id === 999999);
    log(isolated, 'GET /api/products?tenant_id=999999 does not leak tenant-1 rows', `count=${Array.isArray(res._json) ? res._json.length : 'n/a'}`);
  }

  // --- Cleanup -------------------------------------------------------------
  if (createdId != null) {
    const res = mockRes();
    await productsHandler(mockReq({ method: 'DELETE', query: {}, body: { id: createdId, tenant_id: 1 }, token }), res);
    log(res.statusCode === 200, 'Cleanup: deleted acceptance product', `status=${res.statusCode}`);
  }
  if (uploadedPath) {
    const { error } = await service.storage.from('rafd-media').remove([uploadedPath]);
    log(!error, 'Cleanup: removed acceptance image from Storage', error ? error.message : '');
  }

  // Final DB state check — no leftover acceptance rows
  {
    const { count } = await service
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', 1)
      .like('name', 'ACCEPTANCE%');
    log((count ?? 0) === 0, 'Post-cleanup: no acceptance products remain', `leftover=${count}`);
  }

  console.log(`\n──────────────\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('Acceptance crashed:', e);
  process.exit(1);
});
