import { createClient } from '@supabase/supabase-js';
import { triggerRestore } from './db-wake.js';

/**
 * Supabase service client (server-only)
 * Uses SUPABASE_SERVICE_ROLE_KEY - never expose to browser
 * Gracefully handles missing env vars to prevent module load failures
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    '[RAFD SUPABASE BACKEND] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. ' +
    'Check Vercel dashboard / GitHub Secrets / .env.local. ' +
    'SUPABASE_SERVICE_ROLE_KEY is server-only, never prefix with VITE_. ' +
    'See .env.example and docs/SETUP.md'
  );
}

const supabase = createClient(
  supabaseUrl,
  serviceRoleKey,
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
