/**
 * Transactions Domain Router
 * Handles: sales, purchases, refunds
 */
import { setCors } from '../api-shared/auth-middleware.js';

const ROUTES = {
  sales: () => import('../api-shared/modules/sales.js'),
  purchases: () => import('../api-shared/modules/purchases.js'),
  refunds: () => import('../api-shared/modules/refunds.js'),
};

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const pathParts = req.url.split('?')[0].split('/').filter(Boolean);
  const resource = pathParts[2]; // /api/transactions/sales → sales

  const loader = ROUTES[resource];
  if (!loader) {
    return res.status(404).json({ error: `Resource not found: ${resource}` });
  }

  try {
    const { default: routeHandler } = await loader();
    return routeHandler(req, res);
  } catch (err) {
    console.error(`Transactions API error [${resource}]:`, err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
