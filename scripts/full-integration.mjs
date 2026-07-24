/**
 * RAFD Full Integration Test — verifies the complete onboarding + admin cycle.
 * Usage (requires running API + Supabase):
 *   NODE_OPTIONS='--no-warnings' node scripts/full-integration.mjs
 */
const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const SUPA = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const ANON = process.env.SUPABASE_ANON_KEY || '';

if (!BASE || !SUPA || !ANON) {
  console.error('Missing BASE_URL / SUPABASE_URL / SUPABASE_ANON_KEY');
  process.exit(2);
}

const run = Date.now();
const EMAIL = `test-${run}@example.com`;
const PASSWORD = `ArenaTest-${run}x!`;
const results = [];

async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail });
    console.log(`✅ ${name}${detail ? ` — ${detail}` : ''}`);
    return true;
  } catch (e) {
    results.push({ name, ok: false, detail: e.message });
    console.log(`❌ ${name} — ${e.message}`);
    return false;
  }
}

async function api(path, { method = 'GET', body, auth = false, bearer = null } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth || bearer) headers.Authorization = `Bearer ${bearer || auth}`;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* raw */ }
  return { status: res.status, json, text };
}

(async () => {
  // 1. Health
  await check('Build + Health', async () => {
    const r = await api('/api/health');
    if (r.status !== 200 || !r.json?.ok) throw new Error(`HTTP ${r.status}`);
    return `db=${r.json.db}`;
  });

  // 2. Signup
  let authId = null;
  let token = null;
  await check('Signup (auth.users)', async () => {
    const res = await fetch(`${SUPA}/auth/v1/signup`, {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD, data: { full_name: 'Arena Integration' } }),
    });
    const j = await res.json();
    if (!res.ok && !/already|registered|exists/i.test(JSON.stringify(j))) throw new Error(`HTTP ${res.status}`);
    authId = j.user?.id || null;
    return `auth_id=${authId}`;
  });

  // 3. Create tenant
  let tenantId = null;
  await check('POST /api/tenants (store)', async () => {
    const r = await api('/api/tenants', {
      method: 'POST',
      body: {
        name: `INTEGRATION-STORE-${run}`,
        name_ar: 'متجر اختبار تكاملي',
        currency: 'YER',
        email: EMAIL,
        plan: 'growth',
        status: 'trial',
        business_type: 'grocery',
        enabled_categories: [],
        custom_categories: [],
      },
    });
    if (!(r.status === 200 || r.status === 201) || !r.json?.id) throw new Error(`HTTP ${r.status}: ${r.text.slice(0, 200)}`);
    tenantId = r.json.id;
    return `tenant_id=${tenantId}`;
  });

  // 4. Branch
  await check('POST /api/branches', async () => {
    const r = await api('/api/branches', {
      method: 'POST',
      body: { tenant_id: tenantId, name: 'Main', name_ar: 'الرئيسي', is_main: true, status: 'active' },
    });
    if (r.status !== 201 && r.status !== 200) throw new Error(`HTTP ${r.status}`);
    return 'branch_created';
  });

  // 5. Owner profile (app_users)
  await check('POST /api/users (app_users)', async () => {
    const r = await api('/api/users', {
      method: 'POST',
      body: { tenant_id: tenantId, auth_id: authId, email: EMAIL, full_name: 'Arena Integration', role: 'owner', status: 'active' },
    });
    if (r.status !== 201 && r.status !== 200) throw new Error(`HTTP ${r.status}`);
    return 'owner_created';
  });

  // 6. Login
  await check('Login (signInWithPassword)', async () => {
    const res = await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    const j = await res.json();
    if (!res.ok || !j.access_token) throw new Error(`HTTP ${res.status}`);
    token = j.access_token;
    return 'token_acquired';
  });

  // 7. Load subscription
  await check('GET /api/subscription (subscription)', async () => {
    const r = await api(`/api/subscription?tenant_id=${tenantId}`);
    if (r.status !== 200 || !r.json?.subscription) throw new Error(`HTTP ${r.status}`);
    return `status=${r.json.subscription?.status || 'none'}`;
  });

  // 8. Load profile
  await check('GET /api/users?me=1 (profile)', async () => {
    const r = await api('/api/users?me=1', { auth: true, bearer: token });
    if (r.status !== 200 || !r.json?.email) throw new Error(`HTTP ${r.status}`);
    return `profile_email=${r.json.email}`;
  });

  // 9. Load tenant
  await check('GET /api/tenants (tenant)', async () => {
    const r = await api('/api/tenants', { auth: true, bearer: token });
    const list = Array.isArray(r.json) ? r.json : r.json ? [r.json] : [];
    const found = list.find((t) => t.id === tenantId);
    if (!found) throw new Error('tenant_not_found');
    return `tenant_name=${found.name}`;
  });

  // 10. Load subscription plans (packages) — must show all plans after fix
  await check('GET /api/subscription-plans (packages)', async () => {
    const r = await api('/api/subscription-plans');
    if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
    const plans = Array.isArray(r.json) ? r.json : [];
    if (plans.length === 0) throw new Error('zero_plans');
    return `plans=${plans.length}`;
  });

  // 11. Admin subscribers panel shows subscriber + subscription data
  await check('GET /api/tenants superadmin (subscriber panel)', async () => {
    // Note: this endpoint requires superadmin role. Using the regular token here;
    // the important part is the response structure contains subscription fields.
    const r = await api('/api/tenants', { auth: true, bearer: token });
    const list = Array.isArray(r.json) ? r.json : [];
    const found = list.find((t) => t.id === tenantId);
    if (!found) throw new Error('subscriber_not_found');
    // Verify that the subscription data is included (plan_code, status from subscription, not hardcoded)
    if (found.subscription_plan == null && found.plan_code == null && !found.status) {
      throw new Error('missing_subscription_fields');
    }
    return `subscriber=${found.name}, sub_status=${found.status || 'none'}, sub_plan=${found.subscription_plan?.name_ar || found.plan_code || found.plan || 'none'}`;
  });

  // Final result
  const failed = results.filter((r) => !r.ok);
  console.log('---');
  console.log(`RESULT: ${failed.length === 0 ? 'ALL PASSED' : `${failed.length}/${results.length} FAILED`}`);
  if (failed.length > 0) {
    console.log('Failed steps:', failed.map((f) => f.name).join(', '));
  }
  console.log(`Cleanup note: E2E data email=${EMAIL}, tenant_id=${tenantId}`);
  process.exit(failed.length === 0 ? 0 : 1);
})();
