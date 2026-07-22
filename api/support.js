/**
 * Support Domain Router
 * Handles: notifications, push, whatsapp, upload, backups, sync
 */
import { setCors } from './_shared/auth-middleware.js';

const ROUTES = {
  notifications: () => import('./_shared/modules/notifications.js'),
  push: () => import('./_shared/modules/push.js'),
  whatsapp: () => import('./_shared/modules/whatsapp.js'),
  upload: () => import('./_shared/modules/upload.js'),
  backups: () => import('./_shared/modules/backups.js'),
  sync: () => import('./_shared/modules/sync.js'),
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
    console.error(`Support API error [${resource}]:`, err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
