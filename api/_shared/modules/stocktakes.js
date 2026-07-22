import supabase from '../db-client.js';
import { withApi } from '../handler.js';
import { methodNotAllowed } from '../auth-middleware.js';

async function writeAudit(row) {
  try {
    await supabase.from('audit_logs').insert(row);
  } catch {
    /* ignore */
  }
}

export const handler = withApi(
  async function handler(req, res, { auth, tenantId }) {
    if (req.method === 'GET') {
      const { id } = req.query;
      if (id) {
        const { data: session, error } = await supabase.from('stocktake_sessions').select('*').eq('id', id).single();
        if (error) throw error;
        if (tenantId && Number(session.tenant_id) !== Number(tenantId) && auth.role !== 'superadmin') {
          return res.status(403).json({ error: 'Forbidden' });
        }
        const { data: lines } = await supabase
          .from('stocktake_lines')
          .select('*')
          .eq('session_id', id)
          .order('id', { ascending: true });
        return res.status(200).json({ ...session, lines: lines || [] });
      }

      let q = supabase.from('stocktake_sessions').select('*').order('created_at', { ascending: false });
      if (tenantId) q = q.eq('tenant_id', tenantId);
      const { data, error } = await q.limit(50);
      if (error) throw error;
      return res.status(200).json(data || []);
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const action = body.action || 'create';

      if (action === 'create') {
        const { data: products } = await supabase
          .from('products')
          .select('id, name_ar, name, stock, sku, barcode')
          .eq('tenant_id', tenantId)
          .eq('is_active', true);

        const { data: session, error } = await supabase
          .from('stocktake_sessions')
          .insert({
            tenant_id: tenantId,
            branch_id: body.branch_id || null,
            title: body.title || `جرد ${new Date().toISOString().slice(0, 10)}`,
            status: 'draft',
            created_by: auth.profile.full_name || auth.profile.email,
            user_id: auth.profile.id,
            notes: body.notes || null,
          })
          .select()
          .single();
        if (error) throw error;

        const lines = (products || []).map((p) => ({
          session_id: session.id,
          product_id: p.id,
          product_name: p.name_ar || p.name,
          sku: p.sku,
          barcode: p.barcode,
          system_qty: Number(p.stock || 0),
          counted_qty: null,
          variance: null,
        }));
        if (lines.length) await supabase.from('stocktake_lines').insert(lines);

        await writeAudit({
          tenant_id: tenantId,
          user_id: auth.profile.id,
          action: 'stocktake.create',
          entity_type: 'stocktake_sessions',
          entity_id: String(session.id),
          meta: { lines: lines.length },
        });

        const { data: createdLines } = await supabase.from('stocktake_lines').select('*').eq('session_id', session.id);
        return res.status(201).json({ ...session, lines: createdLines || [] });
      }

      if (action === 'count') {
        const { session_id, lines } = body;
        if (!session_id || !Array.isArray(lines)) return res.status(400).json({ error: 'session_id and lines required' });
        const { data: session } = await supabase.from('stocktake_sessions').select('*').eq('id', session_id).single();
        if (!session) return res.status(404).json({ error: 'Not found' });
        if (tenantId && Number(session.tenant_id) !== Number(tenantId) && auth.role !== 'superadmin') {
          return res.status(403).json({ error: 'Forbidden' });
        }
        if (session.status === 'posted') return res.status(400).json({ error: 'Session already posted' });

        for (const line of lines) {
          if (!line.id) continue;
          const counted = line.counted_qty == null ? null : Number(line.counted_qty);
          const { data: current } = await supabase.from('stocktake_lines').select('*').eq('id', line.id).single();
          if (!current) continue;
          const variance = counted == null ? null : counted - Number(current.system_qty || 0);
          await supabase
            .from('stocktake_lines')
            .update({ counted_qty: counted, variance })
            .eq('id', line.id);
        }

        await supabase
          .from('stocktake_sessions')
          .update({ status: 'counting', updated_at: new Date().toISOString() })
          .eq('id', session_id);

        const { data: fresh } = await supabase.from('stocktake_sessions').select('*').eq('id', session_id).single();
        const { data: freshLines } = await supabase.from('stocktake_lines').select('*').eq('session_id', session_id);
        return res.status(200).json({ ...fresh, lines: freshLines || [] });
      }

      if (action === 'post') {
        const session_id = body.session_id;
        if (!session_id) return res.status(400).json({ error: 'session_id required' });
        const { data: session } = await supabase.from('stocktake_sessions').select('*').eq('id', session_id).single();
        if (!session) return res.status(404).json({ error: 'Not found' });
        if (tenantId && Number(session.tenant_id) !== Number(tenantId) && auth.role !== 'superadmin') {
          return res.status(403).json({ error: 'Forbidden' });
        }
        if (session.status === 'posted') return res.status(400).json({ error: 'Already posted' });

        const { data: lines } = await supabase.from('stocktake_lines').select('*').eq('session_id', session_id);
        let adjusted = 0;
        for (const line of lines || []) {
          if (line.counted_qty == null) continue;
          await supabase.from('products').update({ stock: Number(line.counted_qty) }).eq('id', line.product_id);
          adjusted += 1;
        }

        const { data: posted, error } = await supabase
          .from('stocktake_sessions')
          .update({
            status: 'posted',
            posted_at: new Date().toISOString(),
            posted_by: auth.profile.full_name || auth.profile.email,
          })
          .eq('id', session_id)
          .select()
          .single();
        if (error) throw error;

        await writeAudit({
          tenant_id: tenantId,
          user_id: auth.profile.id,
          action: 'stocktake.post',
          entity_type: 'stocktake_sessions',
          entity_id: String(session_id),
          meta: { adjusted },
        });

        return res.status(200).json(posted);
      }

      return res.status(400).json({ error: 'Unknown action' });
    }

    return methodNotAllowed(res);
  },
  {
    permissions: {
      GET: 'stocktake:read',
      POST: 'stocktake:write',
    },
  }
);
