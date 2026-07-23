import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Integration tests for the REAL, unmodified products handler — including the
 * full withApi -> requireAuth -> resolveTenantId -> permission chain — against
 * an in-memory fake Supabase client (api/_lib/test-utils/fakeSupabase.js).
 *
 * Why a fake DB instead of the live rafd-dev project: this sandbox's egress
 * proxy denies direct outbound HTTPS to the Supabase project host (confirmed
 * via the proxy's own status endpoint — an organization policy, not a bug),
 * so no script here can perform a live signInWithPassword/REST round-trip.
 * This suite instead proves the actual production handler code end-to-end
 * with the network layer substituted; RLS/schema-level facts for the same
 * code paths were separately verified live via the Supabase MCP tools.
 *
 * Covers the acceptance criteria requested for Products: create, edit
 * (including cartons restock), delete (including the BL-07 soft-delete
 * guard), search, filter, and tenant isolation / role permission.
 */

vi.mock('../db-client.js', async () => {
  const { createFakeSupabase } = await import('../test-utils/fakeSupabase.js');
  return { supabase: createFakeSupabase() };
});

import { supabase } from '../db-client.js';
import { handler } from './products.js';

const OWNER_AUTH = { id: 'auth-owner-1', email: 'owner@test.rafd' };
const CASHIER_AUTH = { id: 'auth-cashier-1', email: 'cashier@test.rafd' };

function seed() {
  supabase.reset({
    tenants: [{ id: 1, name: 'Tenant A' }, { id: 2, name: 'Tenant B' }],
    app_users: [
      { id: 1, tenant_id: 1, auth_id: OWNER_AUTH.id, email: OWNER_AUTH.email, role: 'owner', status: 'active', full_name: 'Owner' },
      { id: 2, tenant_id: 1, auth_id: CASHIER_AUTH.id, email: CASHIER_AUTH.email, role: 'cashier', status: 'active', full_name: 'Cashier' },
    ],
    products: [],
    product_packaging: [],
    sale_items: [],
  });
}

function mockReq({ method, query = {}, body = null, token, headers = {} }) {
  return {
    method,
    query,
    body,
    url: '/api/products',
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
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

async function asOwner(opts) {
  supabase.setAuthUser(OWNER_AUTH);
  const res = mockRes();
  await handler(mockReq({ token: 'owner-token', ...opts }), res);
  return res;
}
async function asCashier(opts) {
  supabase.setAuthUser(CASHIER_AUTH);
  const res = mockRes();
  await handler(mockReq({ token: 'cashier-token', ...opts }), res);
  return res;
}

describe('products handler — real code, fake DB (acceptance coverage)', () => {
  beforeEach(() => {
    seed();
  });

  it('create: POST computes stock from cartons x units_per_carton and creates a packaging row', async () => {
    const res = await asOwner({
      method: 'POST',
      query: {},
      body: {
        tenant_id: 1,
        name: 'Sugar 1kg',
        name_ar: 'سكر 1كجم',
        sku: 'SKU-1',
        barcode: '1111',
        category: 'بقالة',
        price: 100,
        carton_cost: 1200,
        units_per_carton: 12,
        cartons: 2,
        min_stock: 5,
        unit: 'حبة',
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res._json.stock).toBe(24);
    expect(res._json.units_per_carton).toBe(12);
    expect(res._json.unit_cost).toBeCloseTo(100); // 1200/12
  });

  it('read + search: GET finds the product by partial Arabic name', async () => {
    await asOwner({
      method: 'POST',
      body: { tenant_id: 1, name: 'Rice', name_ar: 'أرز بسمتي', sku: 'SKU-2', price: 50, stock: 10, unit: 'حبة' },
    });
    const res = await asOwner({ method: 'GET', query: { tenant_id: 1, q: 'بسمتي' } });
    expect(res.statusCode).toBe(200);
    expect(res._json).toHaveLength(1);
    expect(res._json[0].name_ar).toBe('أرز بسمتي');
  });

  it('filter: GET low_stock=1 returns only items at/under their min_stock', async () => {
    await asOwner({ method: 'POST', body: { tenant_id: 1, name: 'Low', name_ar: 'منخفض', sku: 'SKU-L', price: 10, stock: 2, min_stock: 5, unit: 'حبة' } });
    await asOwner({ method: 'POST', body: { tenant_id: 1, name: 'High', name_ar: 'مرتفع', sku: 'SKU-H', price: 10, stock: 50, min_stock: 5, unit: 'حبة' } });
    const res = await asOwner({ method: 'GET', query: { tenant_id: 1, low_stock: '1' } });
    expect(res._json.map((p) => p.name_ar)).toEqual(['منخفض']);
  });

  it('edit: PUT add_cartons restocks and updates purchase cost', async () => {
    const created = await asOwner({
      method: 'POST',
      body: { tenant_id: 1, name: 'P', name_ar: 'م', sku: 'SKU-3', price: 20, carton_cost: 120, units_per_carton: 12, cartons: 1, unit: 'حبة' },
    });
    const id = created._json.id;
    const res = await asOwner({
      method: 'PUT',
      body: { id, add_cartons: 2, carton_cost: 240, units_per_carton: 12 },
    });
    expect(res.statusCode).toBe(200);
    // started at 12 (1 carton), +2*12 = 24 more => 36
    expect(res._json.stock).toBe(36);
  });

  it('reload after "page refresh": a fresh GET reflects all prior writes', async () => {
    await asOwner({ method: 'POST', body: { tenant_id: 1, name: 'A', name_ar: 'أ', sku: 'SKU-R1', price: 1, stock: 1, unit: 'حبة' } });
    await asOwner({ method: 'POST', body: { tenant_id: 1, name: 'B', name_ar: 'ب', sku: 'SKU-R2', price: 1, stock: 1, unit: 'حبة' } });
    const res = await asOwner({ method: 'GET', query: { tenant_id: 1 } });
    expect(res._json).toHaveLength(2);
  });

  it('delete: hard-deletes a product with no sales history', async () => {
    const created = await asOwner({ method: 'POST', body: { tenant_id: 1, name: 'X', name_ar: 'س', sku: 'SKU-4', price: 1, stock: 1, unit: 'حبة' } });
    const id = created._json.id;
    const res = await asOwner({ method: 'DELETE', body: { id } });
    expect(res.statusCode).toBe(200);
    expect(res._json.soft_deleted).toBe(false);
    const after = await asOwner({ method: 'GET', query: { tenant_id: 1 } });
    expect(after._json.find((p) => p.id === id)).toBeUndefined();
  });

  it('BL-07: delete soft-deletes (is_active=false) a product that has sales history instead of removing it', async () => {
    const created = await asOwner({ method: 'POST', body: { tenant_id: 1, name: 'Sold', name_ar: 'مباع', sku: 'SKU-5', price: 1, stock: 1, unit: 'حبة' } });
    const id = created._json.id;
    supabase._store.table('sale_items').push({ id: 1, sale_id: 1, product_id: id, product_name: 'Sold', quantity: 1 });

    const res = await asOwner({ method: 'DELETE', body: { id } });
    expect(res.statusCode).toBe(200);
    expect(res._json.soft_deleted).toBe(true);

    const after = await asOwner({ method: 'GET', query: { tenant_id: 1 } });
    const row = after._json.find((p) => p.id === id);
    expect(row).toBeDefined(); // still present (soft-deleted, not gone)
    expect(row.is_active).toBe(false);
  });

  it('tenant isolation: cannot PUT/DELETE a product belonging to another tenant', async () => {
    // Seed a product directly under tenant 2 (simulating another store's data).
    supabase._store.table('products').push({
      id: 999, tenant_id: 2, name: 'Foreign', name_ar: 'أجنبي', sku: 'SKU-F', price: 1, cost: 1, stock: 1, min_stock: 1, unit: 'حبة', is_active: true,
    });
    const putRes = await asOwner({ method: 'PUT', body: { id: 999, price: 5 } });
    expect(putRes.statusCode).toBe(403);
    const delRes = await asOwner({ method: 'DELETE', body: { id: 999 } });
    expect(delRes.statusCode).toBe(403);
  });

  it('permission: cashier role is forbidden from deleting products', async () => {
    const created = await asOwner({ method: 'POST', body: { tenant_id: 1, name: 'Y', name_ar: 'ص', sku: 'SKU-6', price: 1, stock: 1, unit: 'حبة' } });
    const res = await asCashier({ method: 'DELETE', body: { id: created._json.id } });
    expect(res.statusCode).toBe(403);
  });

  it('logout+login equivalent: a brand-new bearer token for the same user resolves identically', async () => {
    await asOwner({ method: 'POST', body: { tenant_id: 1, name: 'Z', name_ar: 'ع', sku: 'SKU-7', price: 1, stock: 1, unit: 'حبة' } });
    // Simulate signing out then back in: fresh token string, same real user —
    // the request pipeline must resolve auth/profile/tenant from scratch again.
    supabase.setAuthUser(OWNER_AUTH);
    const res = mockRes();
    await handler(mockReq({ method: 'GET', query: { tenant_id: 1 }, token: 'brand-new-session-token-after-relogin' }), res);
    expect(res.statusCode).toBe(200);
    expect(res._json).toHaveLength(1);
  });

  it('rejects an unauthenticated request outright (no bearer token)', async () => {
    const res = mockRes();
    await handler(mockReq({ method: 'GET', query: { tenant_id: 1 } }), res);
    expect(res.statusCode).toBe(401);
  });
});
