import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import supabase from '../lib/supabase';
import type { AppUser } from '../lib/types';
import {
  clearCachedSession,
  getCachedProfile,
  saveCachedProfile,
} from '../lib/offline/localSession';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: AppUser | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  profile: null,
  loading: true,
  refreshProfile: async () => {},
  signOut: async () => {},
});

const isOffline = () => typeof navigator !== 'undefined' && !navigator.onLine;

/** Build a minimal User from a cached profile so routing works while offline. */
function offlineUserFromProfile(profile: AppUser): User {
  return {
    id: profile.auth_id || String(profile.id ?? ''),
    email: profile.email,
    app_metadata: {},
    user_metadata: { full_name: profile.full_name },
    aud: 'authenticated',
    created_at: '',
  } as unknown as User;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  // Seed profile from the offline cache so the app is usable before/without network.
  const [profile, setProfile] = useState<AppUser | null>(() => getCachedProfile());
  const [loading, setLoading] = useState(true);

  const loadProfile = async (email?: string | null) => {
    if (!email) {
      // No identity to resolve — keep any cached profile rather than blanking it.
      setProfile(getCachedProfile());
      return;
    }
    try {
      const res = await fetch(`/api/users?email=${encodeURIComponent(email)}`);
      if (!res.ok) {
        const cached = getCachedProfile();
        if (cached) setProfile(cached);
        return;
      }
      const data = await res.json();
      const p: AppUser | null = Array.isArray(data)
        ? data[0] ?? null
        : data && data.id
          ? data
          : null;
      if (p) {
        setProfile(p);
        saveCachedProfile(p);
      } else {
        const cached = getCachedProfile();
        if (cached) setProfile(cached);
      }
    } catch (err) {
      console.error('profile load failed', err);
      const cached = getCachedProfile();
      if (cached) setProfile(cached);
    }
  };

  const refreshProfile = async () => {
    const { data } = await supabase.auth.getSession();
    const email = data.session?.user?.email ?? user?.email ?? getCachedProfile()?.email;
    await loadProfile(email);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (s?.user) {
        setSession(s);
        setUser(s.user);
        loadProfile(s.user.email).finally(() => setLoading(false));
        return;
      }
      // No live Supabase session. If we are offline and have a cached profile,
      // rebuild the session locally so the user stays inside the system.
      const cached = getCachedProfile();
      if (cached && isOffline()) {
        setUser(offlineUserFromProfile(cached));
        setProfile(cached);
      }
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      if (s?.user) {
        setSession(s);
        setUser(s.user);
        loadProfile(s.user.email);
      } else {
        // Signed out or token refresh failed. Preserve an offline session if the
        // user still has a cached profile and did not sign out manually (which
        // clears the cache before Supabase emits this event).
        const cached = getCachedProfile();
        setSession(null);
        if (cached && isOffline()) {
          setUser(offlineUserFromProfile(cached));
          setProfile(cached);
        } else {
          setUser(null);
        }
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signOut = async () => {
    // Clear local caches first so the auth-state-change listener cannot rebuild
    // an offline session while we are trying to sign out.
    clearCachedSession();
    setProfile(null);
    setUser(null);
    setSession(null);
    try {
      await supabase.auth.signOut();
    } catch {
      /* offline sign-out is still a valid local sign-out */
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, refreshProfile, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
