/**
 * Support Domain Router
 * Handles: notifications, push, whatsapp, upload, backups, sync
 */
import { setCors } from '../api-shared/auth-middleware.js';

const ROUTES = {
  notifications: () => import('../api-shared/modules/notifications.js'),
  push: () => import('../api-shared/modules/push.js'),
  whatsapp: () => import('../api-shared/modules/whatsapp.js'),
  upload: () => import('../api-shared/modules/upload.js'),
  backups: () => import('../api-shared/modules/backups.js'),
  sync: () => import('../api-shared/modules/sync.js'),
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
