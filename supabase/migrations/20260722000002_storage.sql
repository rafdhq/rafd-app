-- RAFD | رفد - Storage Setup
-- Run after 000_base_schema.sql
-- Creates public bucket rafd-media for product images and tenant logos

-- Create bucket (idempotent)
INSERT INTO storage.buckets (id, name, public)
VALUES ('rafd-media', 'rafd-media', true)
ON CONFLICT (id) DO NOTHING;

-- Policies for bucket (drop if exists then create)
DROP POLICY IF EXISTS "Public read rafd-media" ON storage.objects;
CREATE POLICY "Public read rafd-media" ON storage.objects
FOR SELECT USING (bucket_id = 'rafd-media');

DROP POLICY IF EXISTS "Authenticated write rafd-media" ON storage.objects;
CREATE POLICY "Authenticated write rafd-media" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'rafd-media');

DROP POLICY IF EXISTS "Authenticated update rafd-media" ON storage.objects;
CREATE POLICY "Authenticated update rafd-media" ON storage.objects
FOR UPDATE USING (bucket_id = 'rafd-media');

DROP POLICY IF EXISTS "Authenticated delete rafd-media" ON storage.objects;
CREATE POLICY "Authenticated delete rafd-media" ON storage.objects
FOR DELETE USING (bucket_id = 'rafd-media');

-- Optional: Add size limit comment
-- Client compresses via src/lib/imageCompress.ts to < 2.5MB
-- Server guards in api/upload.js with max_bytes
