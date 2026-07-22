/**
 * Platform Domain Router (SaaS Management)
 * Handles: tenants, subscription, subscription-plans, platform-announcements, platform-payments, platform-settings
 */
import { setCors } from './_shared/auth-middleware.js';
import { handler as tenantsHandler } from './_shared/modules/tenants.js';
import { handler as subscriptionHandler } from './_shared/modules/subscription.js';
import { handler as subscriptionPlansHandler } from './_shared/modules/subscription-plans.js';
import { handler as platformAnnouncementsHandler } from './_shared/modules/platform-announcements.js';
import { handler as platformPaymentsHandler } from './_shared/modules/platform-payments.js';
import { handler as platformSettingsHandler } from './_shared/modules/platform-settings.js';

const ROUTES = {
  tenants: tenantsHandler,
  subscription: subscriptionHandler,
  'subscription-plans': subscriptionPlansHandler,
  'platform-announcements': platformAnnouncementsHandler,
  'platform-payments': platformPaymentsHandler,
  'platform-settings': platformSettingsHandler,
};

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const pathParts = req.url.split('?')[0].split('/').filter(Boolean);
  const resource = pathParts[2];

  const routeHandler = ROUTES[resource];
  if (!routeHandler) {
    return res.status(404).json({ error: `Resource not found: ${resource}` });
  }

  try {
    return await routeHandler(req, res);
  } catch (err) {
    console.error(`Platform API error [${resource}]:`, err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
