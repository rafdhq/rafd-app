import { setCors } from './_lib/auth-middleware.js';
import { handler as salesHandler } from './_lib/modules/sales.js';
import { handler as purchasesHandler } from './_lib/modules/purchases.js';
import { handler as refundsHandler } from './_lib/modules/refunds.js';

const ROUTES = { sales: salesHandler, purchases: purchasesHandler, refunds: refundsHandler };

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  const resource = req.query?.resource || req.url.split('?')[0].split('/').filter(Boolean)[2];
  const routeHandler = ROUTES[resource];
  if (!routeHandler) return res.status(404).json({ error: `Resource not found: ${resource}` });
  try { return await routeHandler(req, res); }
  catch (err) { console.error(`Transactions API error [${resource}]:`, err); return res.status(500).json({ error: err.message || 'Internal server error' }); }
}
