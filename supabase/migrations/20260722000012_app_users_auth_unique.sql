-- RAFD | رفد - Race condition protection for first owner self-signup
-- ============================================================================
-- Problem: During onboarding, two concurrent POST /api/users with same email
-- could both pass the "existing == null" check and then both try to insert,
-- creating duplicate profiles if only email unique is enforced but auth_id is not.
--
-- Existing guarantee: idx_app_users_email is UNIQUE (prevents duplicate email)
-- Missing guarantee: auth_id had only a non-unique index, so same auth_id
-- with different emails could theoretically duplicate.
--
-- Fix: Add partial unique index on auth_id where auth_id IS NOT NULL.
-- This is the minimal DB change to make self-signup idempotent under race.
-- The application code also handles duplicate-email conflict gracefully
-- (catches 23505 and returns existing row) to make onboarding resilient.
-- Idempotent.
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_auth_unique
  ON app_users(auth_id)
  WHERE auth_id IS NOT NULL;

-- Also ensure email unique is case-insensitive? Existing index is on raw email
-- but app inserts lowercased email always, so case-insensitive is already
-- enforced by application (lowercase before insert). Keep existing unique.
