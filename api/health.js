import { setCors } from './_shared/auth-middleware.js';
import supabase from './_shared/db-client.js';
import { checkBackendEnv } from './_shared/env-check.js';

export default async function handler(req, res) {
  setCors(res, 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const envCheck = checkBackendEnv();

  let db = 'ok';
  let dbDetails = null;
  try {
    const { error, data } = await supabase.from('tenants').select('id').limit(1);
    if (error) {
      db = 'error';
      dbDetails = error.message;
    } else {
      dbDetails = `tenants table accessible, found ${data?.length ?? 0} rows sample`;
    }
  } catch (e) {
    db = 'down';
    dbDetails = e.message || 'unknown error';
  }

  return res.status(200).json({
    ok: true,
    service: 'rafd-api',
    time: new Date().toISOString(),
    db,
    dbDetails,
    version: '1.2.0-p2',
    env: {
      isValid: envCheck.isValid,
      missing: envCheck.missing,
      warnings: envCheck.warnings,
      present: envCheck.present,
      // Never return actual values
      requiredKeys: ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'],
    },
  });
}
