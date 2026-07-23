import { setCors, requireAuth, resolveTenantId, methodNotAllowed } from './auth-middleware';

/**
 * Wrap a resource handler with CORS + auth + tenant resolution.
 *
 * usage:
 * export default withApi(async (req, res, ctx) => { ... })
 * permissions: { GET: 'products:read', POST: 'products:write', ... }
 */
export function withApi(handler, { permissions = {}, publicMethods = [] } = {}) {
  return async function wrapped(req, res) {
    setCors(res);
    if (req.method === 'OPTIONS') return res.status(204).end();

    try {
      const isPublic = publicMethods.includes(req.method);
      let auth = null;
      let tenantId = null;

      if (!isPublic) {
        const permission = permissions[req.method] || permissions['*'] || null;
        auth = await requireAuth(req, res, { permission: permission || undefined });
        if (!auth) return;

        const bodyTenant =
          req.method === 'GET' || req.method === 'DELETE'
            ? req.query?.tenant_id
            : req.body?.tenant_id;

        const t = resolveTenantId(req, auth, bodyTenant);
        if (!t.ok) return res.status(t.status).json({ error: t.error });
        tenantId = t.tenantId;

        // Force body tenant for mutations
        if (req.body && typeof req.body === 'object' && tenantId != null) {
          if (req.body.tenant_id != null && Number(req.body.tenant_id) !== Number(tenantId) && auth.role !== 'superadmin') {
            return res.status(403).json({ error: 'Forbidden: tenant_id mismatch' });
          }
          if (req.body.tenant_id == null) req.body.tenant_id = tenantId;
        }
      }

      return await handler(req, res, { auth, tenantId });
    } catch (err) {
      console.error('API handler error:', err);
      // optional Sentry
      try {
        const { captureException } = await import('./sentry.js');
        captureException(err, { path: req.url, method: req.method });
      } catch {
        /* ignore */
      }
      return res.status(500).json({ error: err.message || 'Internal server error' });
    }
  };
}

export { methodNotAllowed, setCors, requireAuth, resolveTenantId };
