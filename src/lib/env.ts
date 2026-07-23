/**
 * RAFD | رفد - Environment Validation (Frontend)
 * Provides clear error messages when required env vars are missing
 * instead of silent failures deep in Supabase client.
 * 
 * Required vars (per GitHub Secrets/Variables):
 * - VITE_SUPABASE_URL
 * - VITE_SUPABASE_ANON_KEY
 * 
 * The file never contains real secrets - only checks presence.
 */

export interface EnvCheckResult {
  isValid: boolean;
  missing: string[];
  warnings: string[];
  present: string[];
}

const REQUIRED_FRONTEND_VARS = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
] as const;

const OPTIONAL_FRONTEND_VARS = [
  'VITE_GOOGLE_CLIENT_ID',
  'VITE_GOOGLE_AUTH_PROXY',
  'VITE_SENTRY_DSN',
  'VITE_VAPID_PUBLIC_KEY',
] as const;

const REQUIRED_BACKEND_COMPAT_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL', // must match VITE_SUPABASE_URL for api/* compatibility
] as const;

export function checkFrontendEnv(): EnvCheckResult {
  const missing: string[] = [];
  const warnings: string[] = [];
  const present: string[] = [];

  // Check required frontend vars
  for (const key of REQUIRED_FRONTEND_VARS) {
    const val = (import.meta.env as Record<string, unknown>)[key];
    if (!val || typeof val !== 'string' || val.trim() === '' || String(val).includes('YOUR_PROJECT_REF') || String(val).includes('xxxxxxxx')) {
      // Treat placeholder values as missing for development clarity
      // In production, user will have real values; we consider placeholder as missing to guide setup
      // However we allow placeholder if explicitly checking - we check empty OR contains YOUR_PROJECT_REF
      if (!val || String(val).trim() === '') {
        missing.push(key);
      } else if (String(val).includes('YOUR_PROJECT_REF') || String(val).includes('xxxxxxxx')) {
        warnings.push(`${key} contains placeholder value - replace with real Supabase project value for production`);
        present.push(key);
      } else {
        present.push(key);
      }
    } else {
      present.push(key);
    }
  }

  // Check backend compat var (warn if missing, because api/* needs it)
  for (const key of REQUIRED_BACKEND_COMPAT_VARS) {
    // This var is not in import.meta.env for frontend unless also prefixed with VITE_ or set via Vercel
    // We check NEXT_PUBLIC_ via process? Actually Vite exposes only VITE_. So we warn if VITE_ exists but NEXT_PUBLIC_ not documented.
    // For frontend build, NEXT_PUBLIC_ may be undefined - that's okay, backend will check itself.
    // We just warn if VITE_SUPABASE_URL exists but docs suggest NEXT_PUBLIC_ should match.
    const viteUrl = (import.meta.env as Record<string, unknown>)['VITE_SUPABASE_URL'] as string | undefined;
    if (viteUrl && !String(viteUrl).includes('YOUR_PROJECT_REF')) {
      // Advise that NEXT_PUBLIC_SUPABASE_URL must match for api
      warnings.push(`Ensure NEXT_PUBLIC_SUPABASE_URL equals ${viteUrl} in Vercel/Backend env`);
    }
  }

  // Optional vars - warn if not set (but don't fail)
  for (const key of OPTIONAL_FRONTEND_VARS) {
    const val = (import.meta.env as Record<string, unknown>)[key];
    if (!val) {
      // Optional, no warning needed to avoid noise, but we can note for completeness
    } else {
      present.push(key);
    }
  }

  return {
    isValid: missing.length === 0,
    missing,
    warnings,
    present,
  };
}

export function getRequiredFrontendEnvOrThrow(): { url: string; anonKey: string } {
  const check = checkFrontendEnv();
  if (!check.isValid) {
    const msg = `[RAFD ENV ERROR] Missing required frontend environment variables: ${check.missing.join(', ')}\n` +
      `Please create .env.local from .env.example and fill:\n` +
      check.missing.map(k => `  ${k}=https://YOUR_PROJECT.supabase.co`).join('\n') +
      `\nSee docs/SETUP.md and .env.example for details.`;
    
    // In development, log clearly and throw to fail fast with understandable message
    console.error(msg);
    
    // Only throw in development to avoid breaking production build if env injected at runtime via Vercel
    // In production build, Vite inlines env at build time, so missing will be undefined here
    if (import.meta.env.DEV) {
      throw new Error(msg);
    }
  }

  const url = import.meta.env.VITE_SUPABASE_URL as string;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

  // Additional URL format validation
  if (url && !url.startsWith('https://') && !url.includes('supabase.co') && !url.includes('localhost')) {
    console.warn(`[RAFD ENV WARN] VITE_SUPABASE_URL looks invalid: ${url} - expected https://*.supabase.co`);
  }

  return { url, anonKey };
}

export function logEnvStatus() {
  if (!import.meta.env.DEV) return; // only log in dev
  
  const check = checkFrontendEnv();
  if (!check.isValid) {
    console.error('[RAFD ENV] Missing:', check.missing);
  }
  if (check.warnings.length) {
    console.warn('[RAFD ENV] Warnings:', check.warnings);
  }
  if (check.isValid && check.warnings.length === 0) {
    console.info('[RAFD ENV] All required frontend env vars present:', check.present.filter(k => k.startsWith('VITE_SUPABASE')).join(', '));
  }
}
