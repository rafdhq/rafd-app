-- RAFD | رفد - Consolidated Migration
-- This file is auto-generated wrapper for convenience.
-- It executes 000_base_schema.sql + p0_security.sql + p1_features.sql + p2_features.sql in order.
-- You can copy-paste this entire file into Supabase SQL Editor and run once.
-- All statements are IF NOT EXISTS safe.

-- ============================================================================
-- STEP 1: 000_base_schema.sql
-- ============================================================================
\i 000_base_schema.sql

-- ============================================================================
-- STEP 2: p0_security.sql
-- ============================================================================
\i p0_security.sql

-- ============================================================================
-- STEP 3: p1_features.sql
-- ============================================================================
\i p1_features.sql

-- ============================================================================
-- STEP 4: p2_features.sql
-- ============================================================================
\i p2_features.sql

-- If \i not supported (Supabase SQL Editor), manually copy each file content in order.
-- This file serves as documentation of order.
