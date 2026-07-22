import { supabase } from '../db-client.js';
import { withApi } from '../handler.js';
import { methodNotAllowed } from '../auth-middleware.js';

export const handler = withApi(
  async function handler(req, res, { tenantId }) {
    if (req.method !== 'GET') return methodNotAllowed(res);

    const { entity_type, action, limit } = req.query;
    let q = supabase.from('audit_logs').select('*').order('created_at', { ascending: false });
    if (tenantId) q = q.eq('tenant_id', tenantId);
    if (entity_type) q = q.eq('entity_type', entity_type);
    if (action) q = q.eq('action', action);
    const lim = Math.min(Number(limit || 100), 500);
    const { data, error } = await q.limit(lim);
    if (error) throw error;
    return res.status(200).json(data || []);
  },
  { permissions: { GET: 'audit:read' } }
);
