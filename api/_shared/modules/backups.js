import { supabase } from '../db-client.js';
import { withApi } from '../handler.js';

async function snapshotTenant(tenantId) {
  const [
    { data: tenant },
    { data: products },
    { data: customers },
    { data: sales },
    { data: expenses },
    { data: suppliers },
    { data: bank_accounts },
    { data: branches },
  ] = await Promise.all([
    supabase.from('tenants').select('*').eq('id', tenantId).maybeSingle(),
    supabase.from('products').select('*').eq('tenant_id', tenantId),
    supabase.from('customers').select('*').eq('tenant_id', tenantId),
    supabase.from('sales').select('*').eq('tenant_id', tenantId).order('id', { ascending: false }).limit(2000),
    supabase.from('expenses').select('*').eq('tenant_id', tenantId),
    supabase.from('suppliers').select('*').eq('tenant_id', tenantId),
    supabase.from('bank_accounts').select('*').eq('tenant_id', tenantId),
    supabase.from('branches').select('*').eq('tenant_id', tenantId),
  ]);

  return {
    format: 'rafd-backup-v1',
    created_at: new Date().toISOString(),
    tenant_id: tenantId,
    tenant,
    products: products || [],
    customers: customers || [],
    sales: sales || [],
    expenses: expenses || [],
    suppliers: suppliers || [],
    bank_accounts: bank_accounts || [],
    branches: branches || [],
  };
}

export const handler = withApi(
  async function handler(req, res, { auth, tenantId }) {
    if (req.method === 'GET') {
      const tid = tenantId || req.query.tenant_id;
      if (!tid) return res.status(400).json({ error: 'tenant_id required' });
      const { data, error } = await supabase
        .from('backups')
        .select('id, tenant_id, label, created_at, created_by, size_bytes, kind')
        .eq('tenant_id', tid)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return res.status(200).json(data || []);
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const tid = tenantId || body.tenant_id;
      if (!tid) return res.status(400).json({ error: 'tenant_id required' });

      const snap = await snapshotTenant(Number(tid));
      const json = JSON.stringify(snap);
      const size = Buffer.byteLength(json, 'utf8');
      const label = body.label || `backup-${new Date().toISOString().slice(0, 10)}`;
      const kind = body.kind || (body.scheduled ? 'scheduled' : 'manual');

      // store payload in backups table (jsonb/text)
      const row = {
        tenant_id: tid,
        label,
        kind,
        created_by: auth?.user?.email || auth?.profile?.full_name || null,
        size_bytes: size,
        payload: snap,
      };

      let data;
      const ins = await supabase.from('backups').insert(row).select().single();
      if (ins.error) {
        // fallback without jsonb payload column name differences
        const alt = await supabase
          .from('backups')
          .insert({
            tenant_id: tid,
            label,
            kind,
            created_by: row.created_by,
            size_bytes: size,
            payload_json: json,
          })
          .select()
          .single();
        if (alt.error) {
          // last resort: return snapshot without persistence
          return res.status(201).json({
            id: null,
            persisted: false,
            label,
            size_bytes: size,
            created_at: snap.created_at,
            snapshot: snap,
            warning: alt.error.message,
          });
        }
        data = alt.data;
      } else {
        data = ins.data;
      }

      return res.status(201).json({
        id: data.id,
        persisted: true,
        label: data.label || label,
        size_bytes: data.size_bytes || size,
        created_at: data.created_at || snap.created_at,
        kind,
        snapshot: body.include_snapshot === false ? undefined : snap,
      });
    }

    if (req.method === 'PUT') {
      // restore metadata only — full restore is explicit
      const { id, restore } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      if (!restore) return res.status(400).json({ error: 'restore flag required' });

      const { data: bak, error } = await supabase.from('backups').select('*').eq('id', id).single();
      if (error) throw error;
      if (tenantId && Number(bak.tenant_id) !== Number(tenantId) && auth.role !== 'superadmin') {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const snap = bak.payload || (bak.payload_json ? JSON.parse(bak.payload_json) : null);
      if (!snap) return res.status(400).json({ error: 'backup payload missing' });

      // Safe restore: upsert products & customers only (non-destructive sales)
      const products = snap.products || [];
      for (const p of products) {
        const { id: pid, ...rest } = p;
        if (pid) {
          await supabase.from('products').upsert({ id: pid, ...rest });
        }
      }
      const customers = snap.customers || [];
      for (const c of customers) {
        const { id: cid, ...rest } = c;
        if (cid) await supabase.from('customers').upsert({ id: cid, ...rest });
      }

      return res.status(200).json({
        ok: true,
        restored: {
          products: products.length,
          customers: customers.length,
        },
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  },
  {
    permissions: {
      GET: 'backup:read',
      POST: 'backup:read',
      PUT: 'backup:read',
    },
  }
);
