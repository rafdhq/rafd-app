// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { AuthProvider, useAuth } from './AuthContext';
import { getCachedProfile, clearCachedSession } from '../lib/offline/localSession';
import type { AppUser } from '../lib/types';

/**
 * Proves the session-persistence requirements directly against the real
 * AuthContext state machine:
 *  - a session restored by supabase-js after a browser restart resolves the
 *    app profile and caches it;
 *  - going offline with a previously cached profile keeps the user signed in
 *    (rather than bouncing them to /login) instead of requiring network;
 *  - signOut() clears the cache so a stale identity cannot leak into the next
 *    session;
 *  - logging back in after a sign-out re-resolves a fresh profile.
 *
 * A literal OS-level "restart the browser" is not executable in a test
 * runner; what IS directly testable — and is exactly what a restart
 * triggers — is AuthProvider's mount-time effect, which is exercised here
 * with a real localStorage (jsdom) and a mocked supabase.auth surface.
 */

let sessionState: { user: { email: string } } | null = null;
let authChangeCb: ((event: string, session: unknown) => void) | null = null;

vi.mock('../lib/supabase', () => ({
  default: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: sessionState } })),
      onAuthStateChange: vi.fn((cb: (event: string, session: unknown) => void) => {
        authChangeCb = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
      signOut: vi.fn(async () => {
        sessionState = null;
      }),
    },
  },
}));

const PROFILE: AppUser = {
  id: 1,
  tenant_id: 1,
  auth_id: 'bf65000d-ef0c-4f24-84e1-9a82fae91107',
  email: 'malek9art@gmail.com',
  full_name: 'مالك',
  role: 'superadmin',
  status: 'active',
};

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

function mockProfileFetch(profile: AppUser | null) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => (profile ? [profile] : []),
    }))
  );
}

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { value, configurable: true });
}

describe('AuthContext — session persistence (restart / offline / logout / re-login)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionState = null;
    authChangeCb = null;
    setOnline(true);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    setOnline(true);
  });

  it('a session restored after "restart" (getSession resolves) loads and caches the profile', async () => {
    sessionState = { user: { email: PROFILE.email } };
    mockProfileFetch(PROFILE);

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.user?.email).toBe(PROFILE.email);
    expect(result.current.profile?.role).toBe('superadmin');
    expect(getCachedProfile()?.email).toBe(PROFILE.email); // persisted for next restart/offline
  });

  it('offline restart with a previously cached profile keeps the user signed in without a network call', async () => {
    // Simulate a prior successful online login having cached the profile.
    localStorage.setItem('rafd.session.profile', JSON.stringify(PROFILE));
    sessionState = null; // supabase's own token refresh failed (no network)
    setOnline(false);
    mockProfileFetch(null); // network shouldn't even be usable, but guard the assertion

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.user).not.toBeNull();
    expect(result.current.profile?.email).toBe(PROFILE.email);
  });

  it('signOut clears the cached identity so it cannot leak into the next session', async () => {
    sessionState = { user: { email: PROFILE.email } };
    mockProfileFetch(PROFILE);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.profile?.email).toBe(PROFILE.email));

    await act(async () => {
      await result.current.signOut();
    });

    expect(result.current.user).toBeNull();
    expect(result.current.profile).toBeNull();
    expect(getCachedProfile()).toBeNull();
  });

  it('logging back in after sign-out resolves a fresh profile from the new session', async () => {
    // Start signed out.
    sessionState = null;
    mockProfileFetch(null);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();

    // Simulate a fresh login: supabase emits its auth-state-change with a new session.
    mockProfileFetch(PROFILE);
    await act(async () => {
      authChangeCb?.('SIGNED_IN', { user: { email: PROFILE.email } });
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.profile?.email).toBe(PROFILE.email));
    expect(getCachedProfile()?.email).toBe(PROFILE.email);
  });

  it('clearCachedSession (used by manual sign-out) removes profile, tenant and branches together', () => {
    localStorage.setItem('rafd.session.profile', JSON.stringify(PROFILE));
    localStorage.setItem('rafd.session.tenant', JSON.stringify({ id: 1 }));
    localStorage.setItem('rafd.session.branches', JSON.stringify([{ id: 1 }]));
    clearCachedSession();
    expect(localStorage.getItem('rafd.session.profile')).toBeNull();
    expect(localStorage.getItem('rafd.session.tenant')).toBeNull();
    expect(localStorage.getItem('rafd.session.branches')).toBeNull();
  });
});
