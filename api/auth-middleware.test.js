import { describe, expect, it } from 'vitest';
import { hasPermission, ROLE_PERMISSIONS } from './permissions.js';

describe('role permissions', () => {
  it('owner has wildcard', () => {
    expect(hasPermission('owner', 'products:write')).toBe(true);
    expect(hasPermission('owner', 'sales:write')).toBe(true);
  });

  it('cashier can sell but not write products', () => {
    expect(hasPermission('cashier', 'pos:use')).toBe(true);
    expect(hasPermission('cashier', 'sales:write')).toBe(true);
    expect(hasPermission('cashier', 'products:write')).toBe(false);
    expect(hasPermission('cashier', 'products:read')).toBe(true);
  });

  it('warehouse cannot write sales', () => {
    expect(hasPermission('warehouse', 'inventory:write')).toBe(true);
    expect(hasPermission('warehouse', 'sales:write')).toBe(false);
  });

  it('defines all core roles', () => {
    for (const r of ['owner', 'manager', 'cashier', 'warehouse', 'accountant', 'superadmin']) {
      expect(ROLE_PERMISSIONS[r]).toBeTruthy();
    }
  });
});
