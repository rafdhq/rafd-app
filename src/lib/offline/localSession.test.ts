import { beforeEach, describe, expect, it } from 'vitest';
import type { AppUser, Branch, Tenant } from '../types';
import {
  clearCachedSession,
  getCachedBranches,
  getCachedProfile,
  getCachedTenant,
  saveCachedBranches,
  saveCachedProfile,
  saveCachedTenant,
} from './localSession';

// Minimal in-memory localStorage for the node test environment.
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(k: string) {
    return this.store.has(k) ? this.store.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.store.set(k, String(v));
  }
  removeItem(k: string) {
    this.store.delete(k);
  }
  clear() {
    this.store.clear();
  }
}

beforeEach(() => {
  (globalThis as unknown as { localStorage: Storage }).localStorage =
    new MemoryStorage() as unknown as Storage;
});

const profile: AppUser = {
  id: 1,
  tenant_id: 1,
  auth_id: 'bf65000d-ef0c-4f24-84e1-9a82fae91107',
  email: 'malek9art@gmail.com',
  full_name: 'مالك',
  role: 'superadmin',
  status: 'active',
};

const tenant = { id: 1, name: 'RAFD Store', name_ar: 'متجري', currency: 'YER' } as Tenant;
const branches = [{ id: 1, tenant_id: 1, name: 'Main', name_ar: 'الرئيسي', is_main: true, status: 'active' }] as Branch[];

describe('offline localSession', () => {
  it('persists and restores the profile', () => {
    expect(getCachedProfile()).toBeNull();
    saveCachedProfile(profile);
    expect(getCachedProfile()?.email).toBe('malek9art@gmail.com');
    expect(getCachedProfile()?.role).toBe('superadmin');
  });

  it('persists tenant and branches', () => {
    saveCachedTenant(tenant);
    saveCachedBranches(branches);
    expect(getCachedTenant()?.id).toBe(1);
    expect(getCachedBranches()).toHaveLength(1);
  });

  it('clears everything on manual sign-out', () => {
    saveCachedProfile(profile);
    saveCachedTenant(tenant);
    saveCachedBranches(branches);
    clearCachedSession();
    expect(getCachedProfile()).toBeNull();
    expect(getCachedTenant()).toBeNull();
    expect(getCachedBranches()).toEqual([]);
  });

  it('does not throw when nothing is saved', () => {
    saveCachedProfile(null);
    saveCachedTenant(null);
    saveCachedBranches(null);
    expect(getCachedProfile()).toBeNull();
  });
});
