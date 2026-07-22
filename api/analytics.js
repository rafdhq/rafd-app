import { setCors } from './_shared/auth-middleware.js';
import { handler as reportsHandler } from './_shared/modules/reports.js';
import { handler as dashboardHandler } from './_shared/modules/dashboard.js';
import { handler as auditLogsHandler } from './_shared/modules/audit-logs.js';
import { handler as tenantCatalogHandler } from './_shared/modules/tenant-catalog.js';

const ROUTES = { reports: reportsHandler, dashboard: dashboardHandler, 'audit-logs': auditLogsHandler, 'tenant-catalog': tenantCatalogHandler };

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  const resource = req.url.split('?')[0].split('/').filter(Boolean)[2];
  const routeHandler = ROUTES[resource];
  if (!routeHandler) return res.status(404).json({ error: `Resource not found: ${resource}` });
  try { return await routeHandler(req, res); }
  catch (err) { console.error(`Analytics API error [${resource}]:`, err); return res.status(500).json({ error: err.message || 'Internal server error' }); }
}
