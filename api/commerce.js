import { setCors } from './_lib/auth-middleware.js';
import { handler as productsHandler } from './_lib/modules/products.js';
import { handler as customersHandler } from './_lib/modules/customers.js';
import { handler as suppliersHandler } from './_lib/modules/suppliers.js';

const ROUTES = {
  products: productsHandler,
  customers: customersHandler,
  suppliers: suppliersHandler,
};

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  const pathParts = req.url.split('?')[0].split('/').filter(Boolean);
  const resource = req.query?.resource || pathParts[2];
  const routeHandler = ROUTES[resource];
  if (!routeHandler) return res.status(404).json({ error: `Resource not found: ${resource}` });
  try {
    return await routeHandler(req, res);
  } catch (err) {
    console.error(`Commerce API error [${resource}]:`, err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
