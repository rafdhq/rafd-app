import { createClient } from '@supabase/supabase-js';
import { getRequiredFrontendEnvOrThrow, logEnvStatus } from './env';

/**
 * Supabase client - frontend
 * Uses env validation from ./env.ts for clear error messages
 * Required: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (checked at startup)
 */

// Log env status in dev for quick debugging
logEnvStatus();

let supabaseUrl: string;
let supabaseAnonKey: string;

try {
  const env = getRequiredFrontendEnvOrThrow();
  supabaseUrl = env.url;
  supabaseAnonKey = env.anonKey;
} catch (err) {
  // In dev, error already logged with clear message; fallback to allow build to continue
  // In production, build would have failed earlier if missing; here we provide placeholders to avoid crash during static analysis
  if (import.meta.env.DEV) {
    throw err;
  }
  supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
}

// Guard: if still missing, create client with placeholder that will fail with clear Supabase error
// but our env.ts already threw in DEV, so this path is only for prod build with missing env
if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '[RAFD SUPABASE] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' +
    'Check .env.local (local) or Vercel/GitHub Variables (production). ' +
    'See .env.example and docs/SETUP.md'
  );
}

// Offline-first: persist the session locally and auto-refresh the token so a
// user who logged in once online stays signed in across reloads — and, together
// with the cached profile/tenant (src/lib/offline/localSession.ts), can keep
// working offline until they sign out manually.
const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'rafd-auth',
  },
});

export default supabase;
