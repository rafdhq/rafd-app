-- Hardens storage.objects RLS for the public `rafd-media` bucket.
--
-- Root cause: the original policies in 20260722000002_storage.sql were named
-- "Authenticated write/update/delete rafd-media" but were created WITHOUT a
-- `TO authenticated` clause. In Postgres, a CREATE POLICY with no explicit
-- role list defaults to `TO public` — which includes the `anon` role — so any
-- caller holding only the anon key could INSERT/UPDATE/DELETE any object in
-- the bucket directly via the Storage/PostgREST API, bypassing api/upload.js
-- entirely (its tenant folder convention, size guard, and permission check).
--
-- This does not affect the app's actual upload path (api/upload.js uses the
-- service-role key, which always bypasses RLS) — it closes a direct-access
-- gap for anyone holding the public anon key. SELECT stays public (bucket is
-- intentionally public-read so product/logo images render without auth).
--
-- Idempotent: safe to re-run.

DROP POLICY IF EXISTS "Authenticated write rafd-media" ON storage.objects;
CREATE POLICY "Authenticated write rafd-media" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (bucket_id = 'rafd-media');

DROP POLICY IF EXISTS "Authenticated update rafd-media" ON storage.objects;
CREATE POLICY "Authenticated update rafd-media" ON storage.objects
FOR UPDATE TO authenticated USING (bucket_id = 'rafd-media');

DROP POLICY IF EXISTS "Authenticated delete rafd-media" ON storage.objects;
CREATE POLICY "Authenticated delete rafd-media" ON storage.objects
FOR DELETE TO authenticated USING (bucket_id = 'rafd-media');
