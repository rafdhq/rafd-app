import { setCors } from './_lib/auth-middleware.js';
import { handler as loyaltyHandler } from './_lib/modules/loyalty.js';
import { handler as pricingHandler } from './_lib/modules/pricing.js';
import { handler as recipesHandler } from './_lib/modules/recipes.js';
import { handler as aiHandler } from './_lib/modules/ai.js';
import { handler as importExportHandler } from './_lib/modules/import-export.js';

const ROUTES = { loyalty: loyaltyHandler, pricing: pricingHandler, recipes: recipesHandler, ai: aiHandler, 'import-export': importExportHandler };

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  const resource = req.query?.resource || req.url.split('?')[0].split('/').filter(Boolean)[2];
  const routeHandler = ROUTES[resource];
  if (!routeHandler) return res.status(404).json({ error: `Resource not found: ${resource}` });
  try { return await routeHandler(req, res); }
  catch (err) { console.error(`Features API error [${resource}]:`, err); return res.status(500).json({ error: err.message || 'Internal server error' }); }
}
