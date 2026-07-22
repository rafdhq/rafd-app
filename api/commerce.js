/**
 * Commerce Domain Router
 * Handles: products, customers, suppliers
 */
import { setCors } from '../api-shared/auth-middleware.js';

const ROUTES = {
  products: () => import('../api-shared/modules/products.js'),
  customers: () => import('../api-shared/modules/customers.js'),
  suppliers: () => import('../api-shared/modules/suppliers.js'),
};

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const pathParts = req.url.split('?')[0].split('/').filter(Boolean);
  const resource = pathParts[2]; // /api/commerce/products → products

  const loader = ROUTES[resource];
  if (!loader) {
    return res.status(404).json({ error: `Resource not found: ${resource}` });
  }

  try {
    const { default: routeHandler } = await loader();
    return routeHandler(req, res);
  } catch (err) {
    console.error(`Commerce API error [${resource}]:`, err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
