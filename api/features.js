/**
 * Features Domain Router (P2 Advanced Features)
 * Handles: loyalty, pricing, recipes, ai, import-export
 */
import { setCors } from './_shared/auth-middleware.js';

const ROUTES = {
  loyalty: () => import('./_shared/modules/loyalty.js'),
  pricing: () => import('./_shared/modules/pricing.js'),
  recipes: () => import('./_shared/modules/recipes.js'),
  ai: () => import('./_shared/modules/ai.js'),
  'import-export': () => import('./_shared/modules/import-export.js'),
};

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const pathParts = req.url.split('?')[0].split('/').filter(Boolean);
  const resource = pathParts[2];

  const loader = ROUTES[resource];
  if (!loader) {
    return res.status(404).json({ error: `Resource not found: ${resource}` });
  }

  try {
    const { handler: routeHandler } = await loader();
    return routeHandler(req, res);
  } catch (err) {
    console.error(`Features API error [${resource}]:`, err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
