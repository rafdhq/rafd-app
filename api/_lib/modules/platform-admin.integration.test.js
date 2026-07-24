import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Production-stabilization proof for the Platform Admin panel (P0).
 *
 * ROOT CAUSE under test: the panel + its API handlers persisted columns that
 * the database migrations never created, so PostgREST rejected every edit
 * ("column ... does not exist") and the UI showed "تعذر الحفظ".
 *
 * These tests run the REAL, unmodified handlers against an in-memory store that
 * enforces the schema parsed from supabase/migrations/*.sql:
 *   1. Against the PRE-FIX schema (migrations 001-012) every edit FAILS — this
 *      reproduces the production bug.
 *   2. Against the POST-FIX schema (+ 20260722000013_platform_schema_align.sql)
 *      every edit SUCCEEDS and the row is verifiably written to the store —
 *      proving the database is actually modified.
 *   3. Mutations are restricted to an authenticated superadmin; public reads
 *      still work.
 */

vi.mock('../db-client.js', async () => {
  const { createSchemaEnforcingSupabase } = await import('../test-utils/schemaSupabase.js');
  return { supabase: createSchemaEnforcingSupabase(() => globalThis.__rafdSchema) };
});

import { supabase } from '../db-client.js';
import { loadMigrationSchema } from '../test-utils/schemaSupabase.js';
import { handler as settingsHandler } from './platform-settings.js';
import { handler as plansHandler } from './subscription-plans.js';
import { handler as paymentsHandler } from './platform-payments.js';
import { handler as announcementsHandler } from './platform-announcements.js';

const SUPERADMIN = { id: 'auth-super-1', email: 'malek9art@gmail.com' };
const OWNER = { id: 'auth-owner-1', email: 'owner@test.rafd' };

// Schema snapshots derived from the real migration files.
const PRE_FIX_SCHEMA = loadMigrationSchema({ exclude: /platform_schema_align/ });
const POST_FIX_SCHEMA = loadMigrationSchema();

function useSchema(schema) {
  globalThis.__rafdSchema = schema;
}

function mockReq({ method, query = {}, body = null, token }) {
  return {
    method,
    query,
    body,
    url: '/api/platform',
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

function seedPlatform() {
  supabase.reset({
    platform_settings: [
      { id: 1, trial_days: 14, support_email: 'support@rafd.app', support_phone: '+967700000000', maintenance_mode: false },
    ],
    subscription_plans: [
      { id: 1, code: 'growth', name: 'النمو', name_en: 'Growth', is_active: true, features: [], sort_order: 1 },
    ],
    platform_payment_methods: [],
    platform_announcements: [],
    app_users: [
      { id: 1, tenant_id: 1, auth_id: SUPERADMIN.id, email: SUPERADMIN.email, role: 'superadmin', status: 'active' },
      { id: 2, tenant_id: 1, auth_id: OWNER.id, email: OWNER.email, role: 'owner', status: 'active' },
    ],
    tenants: [{ id: 1 }],
    notifications: [],
  });
}

beforeEach(() => {
  seedPlatform();
  supabase.setAuthUser(SUPERADMIN);
});

// ---------------------------------------------------------------------------
// 0) Parser sanity — documents the exact schema drift that broke the panel.
// ---------------------------------------------------------------------------
describe('schema drift (root cause)', () => {
  it('pre-fix platform_settings lacks the branding/contact columns the panel writes', () => {
    const cols = PRE_FIX_SCHEMA.platform_settings;
    expect(cols.has('trial_days')).toBe(true);
    for (const missing of ['app_name', 'app_name_ar', 'logo_url', 'primary_color', 'support_whatsapp', 'website', 'address', 'default_currency', 'invoice_footer', 'allow_registration']) {
      expect(cols.has(missing)).toBe(false);
    }
  });

  it('post-fix migration adds exactly those columns', () => {
    const cols = POST_FIX_SCHEMA.platform_settings;
    for (const added of ['app_name', 'app_name_ar', 'logo_url', 'favicon_url', 'primary_color', 'secondary_color', 'support_whatsapp', 'website', 'address', 'default_currency', 'invoice_footer', 'allow_registration']) {
      expect(cols.has(added)).toBe(true);
    }
  });

  it('post-fix subscription_plans gains name_ar / is_popular / sort_order', () => {
    expect(PRE_FIX_SCHEMA.subscription_plans.has('name_ar')).toBe(false);
    expect(PRE_FIX_SCHEMA.subscription_plans.has('is_popular')).toBe(false);
    expect(PRE_FIX_SCHEMA.subscription_plans.has('sort_order')).toBe(false);
    expect(POST_FIX_SCHEMA.subscription_plans.has('name_ar')).toBe(true);
    expect(POST_FIX_SCHEMA.subscription_plans.has('is_popular')).toBe(true);
    expect(POST_FIX_SCHEMA.subscription_plans.has('sort_order')).toBe(true);
  });

  it('post-fix payment methods & announcements gain their missing columns', () => {
    expect(POST_FIX_SCHEMA.platform_payment_methods.has('name_ar')).toBe(true);
    expect(POST_FIX_SCHEMA.platform_payment_methods.has('provider')).toBe(true);
    expect(POST_FIX_SCHEMA.platform_payment_methods.has('sort_order')).toBe(true);
    expect(POST_FIX_SCHEMA.platform_announcements.has('audience')).toBe(true);
    expect(POST_FIX_SCHEMA.platform_announcements.has('is_published')).toBe(true);
    expect(POST_FIX_SCHEMA.platform_announcements.has('publish_at')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 1) Reproduce the production bug against the PRE-FIX schema.
// ---------------------------------------------------------------------------
describe('PRE-FIX schema — edits fail (reproduces the bug)', () => {
  beforeEach(() => useSchema(PRE_FIX_SCHEMA));

  it('platform-settings PUT fails with "column does not exist"', async () => {
    const res = mockRes();
    await settingsHandler(
      mockReq({ method: 'PUT', token: 't', body: { app_name: 'RAFD', app_name_ar: 'رفد', support_whatsapp: '+9677', website: 'https://rafd.app' } }),
      res
    );
    expect(res.statusCode).toBe(500);
    expect(String(res._json.error)).toMatch(/does not exist/);
  });

  it('subscription-plans POST (new package) fails', async () => {
    const res = mockRes();
    await plansHandler(
      mockReq({ method: 'POST', token: 't', body: { code: 'pro', name: 'Pro', name_ar: 'برو', is_popular: true, sort_order: 2, features: ['a', 'b'] } }),
      res
    );
    expect(res.statusCode).toBe(500);
    expect(String(res._json.error)).toMatch(/does not exist/);
  });

  it('platform-payments POST fails', async () => {
    const res = mockRes();
    await paymentsHandler(
      mockReq({ method: 'POST', token: 't', body: { name: 'Bank', name_ar: 'بنك', provider: 'X', sort_order: 1 } }),
      res
    );
    expect(res.statusCode).toBe(500);
    expect(String(res._json.error)).toMatch(/does not exist/);
  });

  it('platform-announcements POST fails', async () => {
    const res = mockRes();
    await announcementsHandler(
      mockReq({ method: 'POST', token: 't', body: { title: 't', body: 'b', audience: 'all', is_published: true } }),
      res
    );
    expect(res.statusCode).toBe(500);
    expect(String(res._json.error)).toMatch(/does not exist/);
  });
});

// ---------------------------------------------------------------------------
// 2) Verify the fix against the POST-FIX schema — edits persist to the store.
// ---------------------------------------------------------------------------
describe('POST-FIX schema — edits succeed and persist to the database', () => {
  beforeEach(() => useSchema(POST_FIX_SCHEMA));

  it('platform-settings PUT updates the row (contact info + branding)', async () => {
    const res = mockRes();
    await settingsHandler(
      mockReq({
        method: 'PUT',
        token: 't',
        body: {
          app_name: 'RAFD', app_name_ar: 'رفد', primary_color: '#111111', secondary_color: '#222222',
          support_email: 'new@rafd.app', support_phone: '+967711111111', support_whatsapp: '+967722222222',
          website: 'https://rafd.app', address: 'عدن، اليمن', default_currency: 'YER',
          invoice_footer: 'شكراً لكم', trial_days: 21, maintenance_mode: false, allow_registration: true,
        },
      }),
      res
    );
    expect(res.statusCode).toBe(200);
    // Prove the database row was actually modified.
    const row = supabase._store.tables.platform_settings.find((r) => r.id === 1);
    expect(row.support_whatsapp).toBe('+967722222222');
    expect(row.app_name_ar).toBe('رفد');
    expect(row.address).toBe('عدن، اليمن');
    expect(row.trial_days).toBe(21);
  });

  it('subscription-plans POST creates a package, PUT edits it incl. sort_order', async () => {
    const createRes = mockRes();
    await plansHandler(
      mockReq({ method: 'POST', token: 't', body: { code: 'pro', name: 'Pro', name_ar: 'برو', price_monthly: 5000, is_popular: true, sort_order: 2, features: ['ميزة 1', 'ميزة 2'] } }),
      createRes
    );
    expect(createRes.statusCode).toBe(201);
    const created = supabase._store.tables.subscription_plans.find((r) => r.code === 'pro');
    expect(created).toBeTruthy();
    expect(created.name_ar).toBe('برو');
    expect(created.is_popular).toBe(true);
    expect(created.features).toEqual(['ميزة 1', 'ميزة 2']);

    // Edit the package (the exact SuperAdmin "تعديل الباقات" flow), incl. sort_order.
    const putRes = mockRes();
    await plansHandler(
      mockReq({ method: 'PUT', token: 't', body: { id: created.id, name_ar: 'برو بلس', price_monthly: 7500, sort_order: 5, is_popular: false } }),
      putRes
    );
    expect(putRes.statusCode).toBe(200);
    const row = supabase._store.tables.subscription_plans.find((r) => r.id === created.id);
    expect(row.name_ar).toBe('برو بلس');
    expect(row.price_monthly).toBe(7500);
    expect(row.sort_order).toBe(5); // regression: sort_order was previously dropped
    expect(row.is_popular).toBe(false);
  });

  it('platform-payments POST persists and GET orders by sort_order', async () => {
    const res = mockRes();
    await paymentsHandler(
      mockReq({ method: 'POST', token: 't', body: { name: 'Bank', name_ar: 'بنك', provider: 'Kuraimi', sort_order: 3, account_number: '123' } }),
      res
    );
    expect(res.statusCode).toBe(201);
    const row = supabase._store.tables.platform_payment_methods[0];
    expect(row.name_ar).toBe('بنك');
    expect(row.provider).toBe('Kuraimi');
    expect(row.sort_order).toBe(3);

    const getRes = mockRes();
    await paymentsHandler(mockReq({ method: 'GET' }), getRes);
    expect(getRes.statusCode).toBe(200);
    expect(Array.isArray(getRes._json)).toBe(true);
  });

  it('platform-announcements POST persists publish model', async () => {
    const res = mockRes();
    await announcementsHandler(
      mockReq({ method: 'POST', token: 't', body: { title: 'صيانة', body: 'غداً', type: 'warning', audience: 'all', is_published: true, push_to_tenants: true } }),
      res
    );
    expect(res.statusCode).toBe(201);
    const row = supabase._store.tables.platform_announcements[0];
    expect(row.is_published).toBe(true);
    expect(row.audience).toBe('all');
    expect(row.publish_at).toBeTruthy();
    // push_to_tenants wrote a notification row.
    expect(supabase._store.tables.notifications.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 3) Authorization — mutations are superadmin-only, reads stay public.
// ---------------------------------------------------------------------------
describe('authorization', () => {
  beforeEach(() => useSchema(POST_FIX_SCHEMA));

  it('mutation without a token is rejected (401)', async () => {
    const res = mockRes();
    await settingsHandler(mockReq({ method: 'PUT', body: { app_name: 'x' } }), res);
    expect(res.statusCode).toBe(401);
  });

  it('mutation by a non-superadmin (owner) is rejected (403)', async () => {
    supabase.setAuthUser(OWNER);
    const res = mockRes();
    await plansHandler(mockReq({ method: 'POST', token: 't', body: { name: 'x', name_ar: 'x' } }), res);
    expect(res.statusCode).toBe(403);
  });

  it('public read of platform-settings still works without auth', async () => {
    supabase.setAuthUser(null);
    const res = mockRes();
    await settingsHandler(mockReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(200);
    expect(res._json.id).toBe(1);
  });

  it('public read of active plans still works without auth', async () => {
    supabase.setAuthUser(null);
    const res = mockRes();
    await plansHandler(mockReq({ method: 'GET', query: { active: '1' } }), res);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res._json)).toBe(true);
  });
});
