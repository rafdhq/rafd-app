import { setCors } from './auth-middleware.js';
import supabase from './db-client.js';

export default async function handler(req, res) {
  setCors(res, 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  let db = 'ok';
  try {
    const { error } = await supabase.from('tenants').select('id').limit(1);
    if (error) db = error.message;
  } catch (e) {
    db = e.message || 'down';
  }

  return res.status(200).json({
    ok: true,
    service: 'rafd-api',
    time: new Date().toISOString(),
    db,
    version: '1.0.0-p0',
  });
}
