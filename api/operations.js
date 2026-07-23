import { setCors } from './_shared/auth-middleware.js';
import { handler as branchesHandler } from './_shared/modules/branches.js';
import { handler as usersHandler } from './_shared/modules/users.js';
import { handler as shiftsHandler } from './_shared/modules/shifts.js';
import { handler as stocktakesHandler } from './_shared/modules/stocktakes.js';
import { handler as invitesHandler } from './_shared/modules/invites.js';

const ROUTES = { branches: branchesHandler, users: usersHandler, shifts: shiftsHandler, stocktakes: stocktakesHandler, invites: invitesHandler };

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  const resource = req.query?.resource || req.url.split('?')[0].split('/').filter(Boolean)[2];
  const routeHandler = ROUTES[resource];
  if (!routeHandler) return res.status(404).json({ error: `Resource not found: ${resource}` });
  try { return await routeHandler(req, res); }
  catch (err) { console.error(`Operations API error [${resource}]:`, err); return res.status(500).json({ error: err.message || 'Internal server error' }); }
}
