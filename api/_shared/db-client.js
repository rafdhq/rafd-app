import { createClient } from '@supabase/supabase-js';
import { triggerRestore } from './db-wake.js';
import { getRequiredBackendEnvOrThrow, logBackendEnvStatus } from './env-check.js';

/**
 * Supabase service client (server-only)
 * Uses SUPABASE_SERVICE_ROLE_KEY - never expose to browser
 * Validation provides clear error if missing.
 */

logBackendEnvStatus();

let supabaseUrl;
let serviceRoleKey;

try {
  const env = getRequiredBackendEnvOrThrow();
  supabaseUrl = env.url;
  serviceRoleKey = env.serviceRoleKey;
} catch (err) {
  // In Vercel production, env vars are injected at runtime; if missing we log clear error
  // and create client with empty strings that will fail with understandable Supabase error,
  // but the real error message is already thrown above for debugging.
  supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  // Re-throw in non-production? We allow to continue so health check can report missing env
  if (process.env.NODE_ENV !== 'production') {
    console.error(err.message);
  }
}

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    '[RAFD SUPABASE BACKEND] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. ' +
    'Check Vercel dashboard / GitHub Secrets / .env.local. ' +
    'SUPABASE_SERVICE_ROLE_KEY is server-only and must not be prefixed with VITE_. ' +
    'See .env.example and docs/SETUP.md'
  );
}

const supabase = createClient(
  supabaseUrl || '',
  serviceRoleKey || '',
  {
    global: {
      fetch: async (url, options) => {
        const res = await fetch(url, options);
        if (!res.ok && res.status >= 500) triggerRestore();
        return res;
      },
    },
  }
);

export { supabase };
