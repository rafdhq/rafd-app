/**
 * Operations Domain Router
 * Handles: branches, users, shifts, stocktakes, invites
 */
import { setCors } from '../api-shared/auth-middleware.js';

const ROUTES = {
  branches: () => import('../api-shared/modules/branches.js'),
  users: () => import('../api-shared/modules/users.js'),
  shifts: () => import('../api-shared/modules/shifts.js'),
  stocktakes: () => import('../api-shared/modules/stocktakes.js'),
  invites: () => import('../api-shared/modules/invites.js'),
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
    const { default: routeHandler } = await loader();
    return routeHandler(req, res);
  } catch (err) {
    console.error(`Operations API error [${resource}]:`, err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
