/**
 * Platform Domain Router (SaaS Management)
 * Handles: tenants, subscription, subscription-plans, platform-announcements, platform-payments, platform-settings
 */
import { setCors } from '../api-shared/auth-middleware.js';

const ROUTES = {
  tenants: () => import('../api-shared/modules/tenants.js'),
  subscription: () => import('../api-shared/modules/subscription.js'),
  'subscription-plans': () => import('../api-shared/modules/subscription-plans.js'),
  'platform-announcements': () => import('../api-shared/modules/platform-announcements.js'),
  'platform-payments': () => import('../api-shared/modules/platform-payments.js'),
  'platform-settings': () => import('../api-shared/modules/platform-settings.js'),
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
    console.error(`Platform API error [${resource}]:`, err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
