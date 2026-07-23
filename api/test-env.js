/**
 * TEMPORARY diagnostic function for root-cause isolation (to be removed).
 * No static imports -> cannot crash at module load.
 * Reports PRESENCE (never values) of env vars + runtime import smoke tests.
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const report = {
    node: process.version,
    envPresence: {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'set' : 'MISSING',
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'set' : 'MISSING',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'set' : 'MISSING',
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ? 'set' : 'MISSING',
      VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY ? 'set' : 'MISSING',
    },
    supabaseUrlFormat: process.env.NEXT_PUBLIC_SUPABASE_URL
      ? (process.env.NEXT_PUBLIC_SUPABASE_URL.startsWith('https://') &&
         process.env.NEXT_PUBLIC_SUPABASE_URL.includes('.supabase.co')
          ? 'looks-valid'
          : 'SUSPICIOUS-FORMAT')
      : 'n/a',
    importTest_supabasePackage: 'not-tried',
    importTest_dbClient: 'not-tried',
  };

  try {
    const m = await import('@supabase/supabase-js');
    report.importTest_supabasePackage = 'ok (createClient: ' + typeof m.createClient + ')';
  } catch (e) {
    report.importTest_supabasePackage = 'FAIL ' + e.name + ': ' + e.message;
  }

  try {
    await import('./_lib/db-client.js');
    report.importTest_dbClient = 'ok';
  } catch (e) {
    report.importTest_dbClient = 'FAIL ' + e.name + ': ' + String(e.message).split('\n')[0];
  }

  return res.status(200).json(report);
}
