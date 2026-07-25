import { supabase } from './_lib/db-client.js';
import { setCors } from './_lib/auth-middleware.js';

/**
 * GET /api/public-stats — aggregate platform counters for the login page.
 *
 * Deliberately unauthenticated: the login page renders before any session
 * exists. Safety properties that make that acceptable:
 *
 *  1. Counts only. Every query uses { count: 'exact', head: true }, so no row
 *     is ever transferred — there is nothing here to leak beyond three totals.
 *  2. Cached for 5 minutes at the CDN, so a public page cannot turn into a
 *     load amplifier against the database.
 *  3. Soft-fail. Any error returns 200 with nulls rather than 500, so a stats
 *     outage can never break sign-in. The client hides the block on null.
 */

const CACHE_SECONDS = 300;

/** Below this, the numbers read as "new and empty" — the client hides them. */
export const MIN_TENANTS_TO_DISPLAY = 10;

async function countOf(table, apply) {
  try {
    let q = supabase.from(table).select('id', { count: 'exact', head: true });
    if (apply) q = apply(q);
    const { count, error } = await q;
    if (error) return null;
    return typeof count === 'number' ? count : null;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  setCors(req, res, 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const [tenants, invoices, users] = await Promise.all([
      // Registered stores — every tenant, not just active ones. The label on
      // the login page says "متجر مسجّل" to match exactly what is counted.
      countOf('tenants'),
      countOf('sales'),
      countOf('app_users', (q) => q.eq('status', 'active')),
    ]);

    res.setHeader(
      'Cache-Control',
      `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${CACHE_SECONDS * 2}`
    );

    return res.status(200).json({
      tenants,
      invoices,
      active_users: users,
      min_display_threshold: MIN_TENANTS_TO_DISPLAY,
    });
  } catch (err) {
    console.error('public-stats API error:', err);
    // Soft-fail: never surface a 5xx to the login page.
    return res.status(200).json({
      tenants: null,
      invoices: null,
      active_users: null,
      min_display_threshold: MIN_TENANTS_TO_DISPLAY,
    });
  }
}
