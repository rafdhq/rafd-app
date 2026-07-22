import supabase from '../db-client.js';
import { withApi } from '../handler.js';
import { methodNotAllowed } from '../auth-middleware.js';

const ENTITIES = ['products', 'customers', 'suppliers', 'inventory', 'purchases'];

function num(v, d = 0) {
  if (v === '' || v == null) return d;
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

export const handler = withApi(
  async function handler(req, res, { tenantId, auth }) {
    const tid = tenantId;

    if (req.method === 'GET') {
      const entity = req.query.entity || 'products';
      if (!ENTITIES.includes(entity)) return res.status(400).json({ error: 'Invalid entity' });

      if (entity === 'products') {
        const { data, error } = await supabase.from('products').select('*').eq('tenant_id', tid);
        if (error) throw error;
        const { data: packs } = await supabase.from('product_packaging').select('*').eq('tenant_id', tid);
        const map = Object.fromEntries((packs || []).map((p) => [p.product_id, p]));
        const rows = (data || []).map((p) => ({
          name_ar: p.name_ar,
          name: p.name,
          sku: p.sku,
          barcode: p.barcode,
          category: p.category,
          price: p.price,
          cost: p.cost,
          stock: p.stock,
          min_stock: p.min_stock,
          unit: p.unit,
          units_per_carton: map[p.id]?.units_per_carton ?? 1,
          carton_cost: map[p.id]?.carton_cost ?? p.cost,
        }));
        return res.status(200).json({ entity, rows });
      }

      if (entity === 'customers') {
        const { data, error } = await supabase.from('customers').select('*').eq('tenant_id', tid);
        if (error) throw error;
        return res.status(200).json({
          entity,
          rows: (data || []).map((c) => ({
            name: c.name,
            phone: c.phone,
            email: c.email,
            balance: c.balance,
            notes: c.notes,
          })),
        });
      }

      if (entity === 'suppliers') {
        const { data, error } = await supabase.from('suppliers').select('*').eq('tenant_id', tid);
        if (error) throw error;
        return res.status(200).json({
          entity,
          rows: (data || []).map((s) => ({
            name: s.name,
            phone: s.phone,
            email: s.email,
            balance: s.balance,
            notes: s.notes,
          })),
        });
      }

      if (entity === 'inventory') {
        const { data, error } = await supabase.from('products').select('sku, barcode, stock, min_stock, cost').eq('tenant_id', tid);
        if (error) throw error;
        return res.status(200).json({ entity, rows: data || [] });
      }

      if (entity === 'purchases') {
        const { data, error } = await supabase.from('purchases').select('*').eq('tenant_id', tid);
        if (error) throw error;
        return res.status(200).json({
          entity,
          rows: (data || []).map((p) => ({
            reference: p.reference,
            supplier_name: p.supplier_name,
            total: p.total,
            paid: p.paid,
            status: p.status,
            purchase_date: p.purchase_date,
            notes: p.notes,
          })),
        });
      }
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const entity = body.entity;
      const rows = Array.isArray(body.rows) ? body.rows : [];
      if (!ENTITIES.includes(entity)) return res.status(400).json({ error: 'Invalid entity' });
      if (!rows.length) return res.status(400).json({ error: 'rows required' });

      let created = 0;
      let updated = 0;
      const errors = [];

      if (entity === 'products') {
        for (const [idx, r] of rows.entries()) {
          try {
            const payload = {
              tenant_id: tid,
              name: r.name || r.name_ar || `Product ${idx + 1}`,
              name_ar: r.name_ar || r.name || `منتج ${idx + 1}`,
              sku: r.sku || `SKU-${Date.now()}-${idx}`,
              barcode: r.barcode || `${Date.now()}${idx}`,
              category: r.category || 'عام',
              price: num(r.price),
              cost: num(r.cost),
              stock: num(r.stock),
              min_stock: num(r.min_stock, 5),
              unit: r.unit || 'حبة',
              is_active: true,
            };
            let product = null;
            if (r.sku) {
              const { data: ex } = await supabase
                .from('products')
                .select('id')
                .eq('tenant_id', tid)
                .eq('sku', r.sku)
                .maybeSingle();
              if (ex?.id) {
                const { data, error } = await supabase.from('products').update(payload).eq('id', ex.id).select().single();
                if (error) throw error;
                product = data;
                updated++;
              }
            }
            if (!product) {
              const { data, error } = await supabase.from('products').insert(payload).select().single();
              if (error) throw error;
              product = data;
              created++;
            }
            const upc = num(r.units_per_carton, 1) || 1;
            const cartonCost = num(r.carton_cost, num(r.cost) * upc);
            const unitCost = upc ? cartonCost / upc : num(r.cost);
            await supabase.from('products').update({ cost: unitCost }).eq('id', product.id);
            const { data: pack } = await supabase
              .from('product_packaging')
              .select('id')
              .eq('product_id', product.id)
              .maybeSingle();
            const packPayload = {
              product_id: product.id,
              tenant_id: tid,
              units_per_carton: upc,
              carton_cost: cartonCost,
              unit_cost: unitCost,
            };
            if (pack?.id) await supabase.from('product_packaging').update(packPayload).eq('id', pack.id);
            else await supabase.from('product_packaging').insert(packPayload);
          } catch (e) {
            errors.push({ row: idx + 1, error: e.message });
          }
        }
      }

      if (entity === 'customers') {
        for (const [idx, r] of rows.entries()) {
          try {
            if (!r.name) throw new Error('name required');
            const { error } = await supabase.from('customers').insert({
              tenant_id: tid,
              name: r.name,
              phone: r.phone || null,
              email: r.email || null,
              balance: num(r.balance),
              total_purchases: 0,
              notes: r.notes || null,
            });
            if (error) throw error;
            created++;
          } catch (e) {
            errors.push({ row: idx + 1, error: e.message });
          }
        }
      }

      if (entity === 'suppliers') {
        for (const [idx, r] of rows.entries()) {
          try {
            if (!r.name) throw new Error('name required');
            const { error } = await supabase.from('suppliers').insert({
              tenant_id: tid,
              name: r.name,
              phone: r.phone || null,
              email: r.email || null,
              balance: num(r.balance),
              notes: r.notes || null,
            });
            if (error) throw error;
            created++;
          } catch (e) {
            errors.push({ row: idx + 1, error: e.message });
          }
        }
      }

      if (entity === 'inventory') {
        for (const [idx, r] of rows.entries()) {
          try {
            let q = supabase.from('products').select('id').eq('tenant_id', tid);
            if (r.sku) q = q.eq('sku', r.sku);
            else if (r.barcode) q = q.eq('barcode', r.barcode);
            else throw new Error('sku or barcode required');
            const { data: prod } = await q.maybeSingle();
            if (!prod) throw new Error('product not found');
            const patch = {};
            if (r.stock != null && r.stock !== '') patch.stock = num(r.stock);
            if (r.min_stock != null && r.min_stock !== '') patch.min_stock = num(r.min_stock);
            if (r.cost != null && r.cost !== '') patch.cost = num(r.cost);
            const { error } = await supabase.from('products').update(patch).eq('id', prod.id);
            if (error) throw error;
            updated++;
          } catch (e) {
            errors.push({ row: idx + 1, error: e.message });
          }
        }
      }

      if (entity === 'purchases') {
        for (const [idx, r] of rows.entries()) {
          try {
            const { error } = await supabase.from('purchases').insert({
              tenant_id: tid,
              supplier_name: r.supplier_name || null,
              reference: r.reference || `PO-IMP-${Date.now()}-${idx}`,
              total: num(r.total),
              paid: num(r.paid),
              status: r.status || 'received',
              purchase_date: r.purchase_date || new Date().toISOString().slice(0, 10),
              notes: r.notes || null,
            });
            if (error) throw error;
            created++;
          } catch (e) {
            errors.push({ row: idx + 1, error: e.message });
          }
        }
      }

      try {
        await supabase.from('audit_logs').insert({
          tenant_id: tid,
          actor_email: auth?.profile?.email || null,
          action: 'import.' + entity,
          entity,
          entity_id: null,
          meta: { created, updated, errors: errors.length },
        });
      } catch {
        /* optional */
      }

      // queue outbox-friendly sync signal via notifications
      try {
        await supabase.from('notifications').insert({
          tenant_id: tid,
          title: 'Import completed',
          body: `${entity}: +${created} / ~${updated} / !${errors.length}`,
          type: errors.length ? 'warning' : 'success',
          is_read: false,
        });
      } catch {
        /* optional */
      }

      return res.status(200).json({ ok: true, created, updated, errors });
    }

    return methodNotAllowed(res);
  },
  {
    permissions: {
      GET: 'export:use',
      POST: 'import:use',
    },
  }
);
