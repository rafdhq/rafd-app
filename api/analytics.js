/**
 * Analytics Domain Router
 * Handles: reports, dashboard, audit-logs, tenant-catalog
 */
import { setCors } from './_shared/auth-middleware.js';

const ROUTES = {
  reports: () => import('./_shared/modules/reports.js'),
  dashboard: () => import('./_shared/modules/dashboard.js'),
  'audit-logs': () => import('./_shared/modules/audit-logs.js'),
  'tenant-catalog': () => import('./_shared/modules/tenant-catalog.js'),
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
    console.error(`Analytics API error [${resource}]:`, err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
