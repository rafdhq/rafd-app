/**
 * RAFD Supabase Connection Test - runs in GitHub Actions with secrets
 * Does NOT log secret values, only status
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

console.log('=== RAFD Supabase Connection Check ===');
console.log(`URL present: ${!!url} (${url ? url.slice(0,30)+'...' : 'missing'})`);
console.log(`Service Role present: ${!!serviceKey}`);
console.log(`Anon Key present: ${!!anonKey}`);

if (!url || !serviceKey) {
  console.error('❌ Missing required env vars: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  console.error('Check GitHub Secrets/Variables and docs/SETUP.md');
  process.exit(1);
}

const supabase = createClient(url, serviceKey);

try {
  console.log('\n--- Testing DB connection: tenants table ---');
  const { data, error } = await supabase.from('tenants').select('id').limit(1);
  
  if (error) {
    // If table doesn't exist, we need to run migrations
    if (error.message.includes('does not exist') || error.code === '42P01') {
      console.warn('⚠️ tenants table does not exist - Base schema not yet executed');
      console.warn('Action needed: Execute supabase/000_base_schema.sql in Supabase SQL Editor');
      console.log('Error details:', error.message);
      // Don't fail hard, just warn - user needs to run SQL manually or via workflow
      process.exit(0);
    }
    console.error('❌ DB connection failed:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  }

  console.log(`✅ DB connection successful! tenants sample: ${data?.length ?? 0} rows`);
  
  // Check other critical tables
  const tablesToCheck = [
    'branches', 'app_users', 'products', 'customers', 'sales',
    'cashier_shifts', 'loyalty_programs', 'price_lists', 'recipes', 'ai_conversations'
  ];
  
  console.log('\n--- Checking critical tables ---');
  for (const table of tablesToCheck) {
    try {
      const { error: tError } = await supabase.from(table).select('id').limit(1);
      if (tError) {
        if (tError.message.includes('does not exist')) {
          console.warn(`⚠️ Table ${table} MISSING - need to run P0/P1/P2 SQL`);
        } else {
          console.warn(`⚠️ Table ${table} error: ${tError.message}`);
        }
      } else {
        console.log(`✓ Table ${table} exists`);
      }
    } catch (e) {
      console.warn(`⚠️ Table ${table} check failed: ${e.message}`);
    }
  }

  // Check storage bucket
  console.log('\n--- Checking storage bucket: rafd-media ---');
  try {
    const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
    if (bucketError) {
      console.warn(`⚠️ Storage check failed: ${bucketError.message}`);
    } else {
      const rafdBucket = buckets?.find(b => b.name === 'rafd-media');
      if (rafdBucket) {
        console.log(`✓ Bucket rafd-media exists (public: ${rafdBucket.public})`);
      } else {
        console.warn('⚠️ Bucket rafd-media MISSING - needs creation via 001_storage.sql or Dashboard');
      }
    }
  } catch (e) {
    console.warn(`⚠️ Storage check error: ${e.message}`);
  }

  console.log('\n=== Check Complete ===');
  console.log('If any tables/missing warnings above, execute SQL files in order:');
  console.log('1) supabase/000_base_schema.sql');
  console.log('2) supabase/001_storage.sql');
  console.log('3) supabase/p0_security.sql');
  console.log('4) supabase/p1_features.sql');
  console.log('5) supabase/p2_features.sql');
  console.log('See supabase/README.md and docs/SETUP.md');

} catch (err) {
  console.error('❌ Unexpected error:', err);
  process.exit(1);
}
