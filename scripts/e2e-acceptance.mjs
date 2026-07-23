/**
 * RAFD E2E Acceptance — production/preview smoke test.
 * Mirrors the exact onboarding flow in src/pages/Onboarding.tsx:
 *   health → signup → create store (tenant) → branch → owner profile →
 *   login → create product (JWT) → create invoice/sale (JWT).
 *
 * Usage:
 *   BASE_URL=https://<deployment>.vercel.app \
 *   SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_ANON_KEY=<anon-key> \
 *   node scripts/e2e-acceptance.mjs
 *
 * Exits non-zero on first failing step. Creates clearly-labelled E2E data
 * (store/user/product/sale) that can be deleted afterwards.
 */
const BASE = (process.env.BASE_URL || '').replace(/\/$/, '');
const SUPA = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const ANON = process.env.SUPABASE_ANON_KEY || '';
if (!BASE || !SUPA || !ANON) {
  console.error('Missing BASE_URL / SUPABASE_URL / SUPABASE_ANON_KEY');
  process.exit(2);
}

const run = Date.now();
const EMAIL = `arena-e2e-${run}@example.com`;
const PASSWORD = `Arena-E2E-${run}x!`;
let token = null;
let tenantId = null;
let productId = null;
let authId = null;

const results = [];
async function step(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, status: 'PASS', detail });
    console.log(`PASS | ${name}${detail ? ` | ${detail}` : ''}`);
    return true;
  } catch (e) {
    results.push({ name, status: 'FAIL', detail: e.message });
    console.log(`FAIL | ${name} | ${e.message}`);
    return false;
  }
}
async function api(path, { method = 'GET', body, auth = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* keep raw */ }
  return { status: res.status, json, text };
}

// 1) /api/health
const ok1 = await step('GET /api/health returns 200 JSON with db ok', async () => {
  const r = await api('/api/health');
  if (r.status !== 200) throw new Error(`HTTP ${r.status}: ${r.text.slice(0, 120)}`);
  if (!r.json?.ok) throw new Error('json.ok is not true');
  if (r.json.db !== 'ok') throw new Error(`db="${r.json.db}" (${r.json.dbDetails})`);
  return `db=${r.json.db}, env.isValid=${r.json.env?.isValid}`;
});
if (!ok1) process.exit(1);

// 2) Create first account (Supabase Auth signup — same call as Onboarding.tsx)
const ok2 = await step('Signup (create first account)', async () => {
  const res = await fetch(`${SUPA}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, data: { full_name: 'Arena E2E Owner' } }),
  });
  const j = await res.json();
  if (!res.ok && !/already|registered|exists/i.test(JSON.stringify(j))) {
    throw new Error(`HTTP ${res.status}: ${JSON.stringify(j).slice(0, 200)}`);
  }
  authId = j.user?.id || j.id || null;
  token = j.access_token || null;
  return `auth_id=${authId || 'pending-login'}`;
});
if (!ok2) process.exit(1);

// 3) Create store (tenant) — public bootstrap endpoint
const ok3 = await step('POST /api/tenants (create store)', async () => {
  const r = await api('/api/tenants', {
    method: 'POST',
    body: {
      name: `ARENA-E2E-STORE-${run}`,
      name_ar: 'متجر اختبار آلي',
      currency: 'YER',
      email: EMAIL,
      plan: 'growth',
      status: 'trial',
      business_type: 'grocery',
      enabled_categories: [],
      custom_categories: [],
    },
  });
  if (!(r.status === 200 || r.status === 201) || !r.json?.id) {
    throw new Error(`HTTP ${r.status}: ${r.text.slice(0, 200)}`);
  }
  tenantId = r.json.id;
  return `tenant_id=${tenantId}`;
});
if (!ok3) process.exit(1);

// 4) Main branch + 5) owner profile (bootstrap, mirrors Onboarding.tsx)
await step('POST /api/branches (main branch)', async () => {
  const r = await api('/api/branches', {
    method: 'POST',
    body: { tenant_id: tenantId, name: 'E2E Main', name_ar: 'الفرع الرئيسي', is_main: true, status: 'active' },
  });
  if (!(r.status === 200 || r.status === 201)) throw new Error(`HTTP ${r.status}: ${r.text.slice(0, 160)}`);
  return `branch_id=${r.json?.id}`;
});
await step('POST /api/users (owner profile)', async () => {
  const r = await api('/api/users', {
    method: 'POST',
    body: { tenant_id: tenantId, auth_id: authId, email: EMAIL, full_name: 'Arena E2E Owner', role: 'owner', status: 'active' },
  });
  if (!(r.status === 200 || r.status === 201)) throw new Error(`HTTP ${r.status}: ${r.text.slice(0, 160)}`);
});

// 6) Login (password grant — what the app login page does)
const ok6 = await step('Login (signInWithPassword)', async () => {
  const res = await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const j = await res.json();
  if (!res.ok || !j.access_token) throw new Error(`HTTP ${res.status}: ${JSON.stringify(j).slice(0, 200)}`);
  token = j.access_token;
  authId = authId || j.user?.id;
  return 'access_token acquired';
});
if (!ok6) process.exit(1);

// 7) Create product (JWT-protected API path — exercises auth-middleware + tenant)
const ok7 = await step('POST /api/products (create product, JWT)', async () => {
  const r = await api('/api/products', {
    method: 'POST',
    auth: true,
    body: {
      tenant_id: tenantId,
      name: `E2E Product ${run}`,
      name_ar: 'منتج اختبار آلي',
      sku: `E2E-${run}`,
      barcode: String(run),
      category: 'عام',
      price: 150,
      cost: 80,
      stock: 20,
      unit: 'حبة',
    },
  });
  if (r.status !== 201 || !r.json?.id) throw new Error(`HTTP ${r.status}: ${r.text.slice(0, 200)}`);
  productId = r.json.id;
  return `product_id=${productId}`;
});
if (!ok7) process.exit(1);

// 8) Create invoice (sale) (JWT-protected)
const ok8 = await step('POST /api/sales (create invoice, JWT)', async () => {
  const r = await api('/api/sales', {
    method: 'POST',
    auth: true,
    body: {
      tenant_id: tenantId,
      customer_name: 'عميل اختبار آلي',
      invoice_number: `E2E-INV-${run}`,
      subtotal: 150,
      discount: 0,
      tax: 0,
      total: 150,
      paid: 150,
      payment_method: 'cash',
      status: 'completed',
      items: [{ product_id: productId, product_name: `E2E Product ${run}`, quantity: 1, unit_price: 150, total: 150 }],
    },
  });
  if (!(r.status === 200 || r.status === 201) || !r.json?.id) throw new Error(`HTTP ${r.status}: ${r.text.slice(0, 200)}`);
  return `sale_id=${r.json.id}`;
});
if (!ok8) process.exit(1);

console.log('---');
const failed = results.filter((r) => r.status !== 'PASS');
console.log(failed.length === 0
  ? `ALL ${results.length} ACCEPTANCE STEPS PASSED`
  : `${failed.length}/${results.length} STEPS FAILED`);
console.log(`Cleanup note: E2E data created with email=${EMAIL}, tenant_id=${tenantId}, product_id=${productId}`);
process.exit(failed.length === 0 ? 0 : 1);
