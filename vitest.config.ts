import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'api/**/*.test.js'],
    // Test-only placeholder credentials so modules that construct a Supabase
    // client at import time can initialize during tests without a live project.
    // These populate process.env (read by api/_lib/db-client.js in the Node
    // api/* tests). The browser-side import.meta.env used by src/* tests is
    // provided by the matching values in .env.test. No real secrets, no change
    // to production code.
    env: {
      VITE_SUPABASE_URL: 'https://test-placeholder.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'test-placeholder-anon-key',
      NEXT_PUBLIC_SUPABASE_URL: 'https://test-placeholder.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-placeholder-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'test-placeholder-service-role-key',
    },
  },
});
