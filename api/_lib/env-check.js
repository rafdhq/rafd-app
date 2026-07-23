/**
 * RAFD | رفد - Backend Environment Validation (Vercel api/*)
 * Checks required backend env vars and returns clear error messages
 * Required (per GitHub Secrets/Variables):
 * - NEXT_PUBLIC_SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 * - (fallback) NEXT_PUBLIC_SUPABASE_ANON_KEY or VITE_SUPABASE_ANON_KEY for user-scoped client
 * 
 * Never logs secret values, only names.
 */

export function checkBackendEnv() {
  // SUPABASE_SERVICE_ROLE_KEY has no fallback.
  // NEXT_PUBLIC_SUPABASE_URL falls back to VITE_SUPABASE_URL (same value per .env.example),
  // mirroring the existing anon-key fallback below.
  const required = [
    'SUPABASE_SERVICE_ROLE_KEY',
  ];

  const missing = [];
  const warnings = [];
  const present = [];

  for (const key of required) {
    const val = process.env[key];
    if (!val || String(val).trim() === '' || String(val).includes('YOUR_PROJECT_REF') || String(val).includes('xxxxxxxx')) {
      if (!val || String(val).trim() === '') {
        missing.push(key);
      } else {
        warnings.push(`${key} contains placeholder - replace with real value`);
        present.push(key);
      }
    } else {
      present.push(key);
    }
  }

  // Check URL fallback (NEXT_PUBLIC_ preferred, VITE_ accepted)
  const resolvedUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  if (!resolvedUrl) {
    missing.push('NEXT_PUBLIC_SUPABASE_URL (or VITE_SUPABASE_URL fallback)');
  } else {
    present.push(process.env.NEXT_PUBLIC_SUPABASE_URL ? 'NEXT_PUBLIC_SUPABASE_URL' : 'VITE_SUPABASE_URL (as NEXT_PUBLIC_SUPABASE_URL fallback)');
  }

  // Check anon key fallback
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!anonKey) {
    warnings.push('NEXT_PUBLIC_SUPABASE_ANON_KEY (or VITE_SUPABASE_ANON_KEY fallback) missing - user-scoped auth client (auth-middleware) will fail. Recommended for RLS user client.');
  } else {
    present.push('NEXT_PUBLIC_SUPABASE_ANON_KEY or VITE_SUPABASE_ANON_KEY');
  }

  // Check URL format (against the resolved URL, whichever var it came from)
  const url = resolvedUrl;
  if (url && !url.startsWith('https://') && !url.includes('supabase.co') && !url.includes('localhost')) {
    warnings.push(`NEXT_PUBLIC_SUPABASE_URL looks invalid: must be https://*.supabase.co`);
  }

  // Check VITE_ parity warning
  const viteUrl = process.env.VITE_SUPABASE_URL;
  if (viteUrl && url && viteUrl !== url) {
    warnings.push(`VITE_SUPABASE_URL (${viteUrl}) != NEXT_PUBLIC_SUPABASE_URL (${url}) - they should match for consistency`);
  }

  return {
    isValid: missing.length === 0,
    missing,
    warnings,
    present,
  };
}

export function getRequiredBackendEnvOrThrow() {
  const check = checkBackendEnv();
  if (!check.isValid) {
    const message = `[RAFD BACKEND ENV ERROR] Missing required backend env vars: ${check.missing.join(', ')} ` +
      `(checked process.env). Ensure GitHub Secrets/Variables and Vercel Environment Variables contain: ${check.missing.join(', ')}. ` +
      `See .env.example and docs/SETUP.md - SUPABASE_SERVICE_ROLE_KEY is server-only, never prefix with VITE_.`;
    console.error(message);
    throw new Error(message);
  }
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY,
  };
}

export function logBackendEnvStatus() {
  // Only log in development or when explicitly enabled, to avoid leaking names in prod logs? Names are okay, values never logged.
  const check = checkBackendEnv();
  if (!check.isValid) {
    console.error('[RAFD BACKEND ENV] Missing:', check.missing);
  }
  if (check.warnings.length) {
    console.warn('[RAFD BACKEND ENV] Warnings:', check.warnings);
  }
}
