import { supabase } from '../db-client.js';
import { withApi } from '../handler.js';

export const handler = withApi(
  async function handler(req, res, { tenantId }) {
    if (req.method === 'GET') {
      const tid = tenantId || req.query.tenant_id;
      let q = supabase.from('sync_status').select('*').order('id', { ascending: true });
      if (tid) q = q.eq('tenant_id', tid);
      const { data, error } = await q;
      if (error) throw error;
      return res.status(200).json(tid ? data?.[0] || null : data);
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const tid = tenantId || body.tenant_id;
      if (!tid) return res.status(400).json({ error: 'tenant_id required' });

      const now = new Date().toISOString();
      const pending = Number(body.client_pending ?? body.pending_changes ?? 0) || 0;
      const pullVersion = body.pull_version || null;

      // bidirectional cursor: store server watermark + client pending
      const payload = {
        status: pending > 0 ? 'pending' : 'online',
        last_sync_at: now,
        message:
          body.message ||
          (pending > 0
            ? `مزامنة مع ${pending} عنصر بانتظار التأكيد`
            : 'تمت المزامنة الثنائية مع السحابة'),
        pending_changes: pending,
        server_version: pullVersion ? String(pullVersion) : now,
      };

      const { data: existing } = await supabase
        .from('sync_status')
        .select('id')
        .eq('tenant_id', tid)
        .maybeSingle();

      let data;
      if (existing?.id) {
        const result = await supabase
          .from('sync_status')
          .update(payload)
          .eq('id', existing.id)
          .select()
          .single();
        if (result.error) {
          // columns may not include server_version
          const fallback = { ...payload };
          delete fallback.server_version;
          const r2 = await supabase
            .from('sync_status')
            .update(fallback)
            .eq('id', existing.id)
            .select()
            .single();
          if (r2.error) throw r2.error;
          data = r2.data;
        } else data = result.data;
      } else {
        const result = await supabase
          .from('sync_status')
          .insert({ tenant_id: tid, ...payload })
          .select()
          .single();
        if (result.error) {
          const fallback = { tenant_id: tid, ...payload };
          delete fallback.server_version;
          const r2 = await supabase.from('sync_status').insert(fallback).select().single();
          if (r2.error) throw r2.error;
          data = r2.data;
        } else data = result.data;
      }

      // return pull hints for clients
      const { data: products } = await supabase
        .from('products')
        .select('id, updated_at, stock, price, cost')
        .eq('tenant_id', tid)
        .order('id', { ascending: true })
        .limit(500);

      return res.status(200).json({
        ...data,
        pull: {
          products_watermark: products?.[products.length - 1]?.id || null,
          products_count: products?.length || 0,
        },
      });
    }

    if (req.method === 'PUT') {
      const { id, ...rest } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      const { data, error } = await supabase.from('sync_status').update(rest).eq('id', id).select().single();
      if (error) throw error;
      return res.status(200).json(data);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  },
  {
    permissions: {
      GET: 'sync:use',
      POST: 'sync:use',
      PUT: 'sync:use',
    },
  }
);
