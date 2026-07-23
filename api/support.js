import { setCors } from '../api-shared/auth-middleware.js';
import { handler as notificationsHandler } from '../api-shared/modules/notifications.js';
import { handler as pushHandler } from '../api-shared/modules/push.js';
import { handler as whatsappHandler } from '../api-shared/modules/whatsapp.js';
import { handler as uploadHandler } from '../api-shared/modules/upload.js';
import { handler as backupsHandler } from '../api-shared/modules/backups.js';
import { handler as syncHandler } from '../api-shared/modules/sync.js';

const ROUTES = { notifications: notificationsHandler, push: pushHandler, whatsapp: whatsappHandler, upload: uploadHandler, backups: backupsHandler, sync: syncHandler };

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  const resource = req.query?.resource || req.url.split('?')[0].split('/').filter(Boolean)[2];
  const routeHandler = ROUTES[resource];
  if (!routeHandler) return res.status(404).json({ error: `Resource not found: ${resource}` });
  try { return await routeHandler(req, res); }
  catch (err) { console.error(`Support API error [${resource}]:`, err); return res.status(500).json({ error: err.message || 'Internal server error' }); }
}
