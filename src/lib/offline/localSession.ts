/**
 * Offline-first local session cache.
 *
 * After a successful ONLINE login, the resolved profile / tenant / branches are
 * persisted to localStorage. On subsequent loads — including while completely
 * offline or with an unrefreshable Supabase token — the app reads these caches so
 * the user stays inside the system until they sign out manually.
 *
 * Supabase itself already persists the auth session (access/refresh token) to
 * localStorage; this module persists the *application* identity that our own
 * /api layer would otherwise have to fetch over the network on every load.
 */

import type { AppUser, Branch, Tenant } from '../types';

const PROFILE_KEY = 'rafd.session.profile';
const TENANT_KEY = 'rafd.session.tenant';
const BRANCHES_KEY = 'rafd.session.branches';

function safeStorage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

function readJson<T>(key: string): T | null {
  const s = safeStorage();
  if (!s) return null;
  try {
    const v = s.getItem(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  const s = safeStorage();
  if (!s) return;
  try {
    s.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private mode — non-fatal */
  }
}

function remove(key: string) {
  const s = safeStorage();
  if (!s) return;
  try {
    s.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function saveCachedProfile(profile: AppUser | null) {
  if (!profile) return;
  writeJson(PROFILE_KEY, profile);
}

export function getCachedProfile(): AppUser | null {
  return readJson<AppUser>(PROFILE_KEY);
}

export function saveCachedTenant(tenant: Tenant | null) {
  if (!tenant) return;
  writeJson(TENANT_KEY, tenant);
}

export function getCachedTenant(): Tenant | null {
  return readJson<Tenant>(TENANT_KEY);
}

export function saveCachedBranches(branches: Branch[] | null) {
  if (!branches) return;
  writeJson(BRANCHES_KEY, branches);
}

export function getCachedBranches(): Branch[] {
  return readJson<Branch[]>(BRANCHES_KEY) || [];
}

/** Clear every cached identity artifact — used on manual sign-out. */
export function clearCachedSession() {
  remove(PROFILE_KEY);
  remove(TENANT_KEY);
  remove(BRANCHES_KEY);
}
