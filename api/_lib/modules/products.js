import { supabase } from '../db-client.js';
import { withApi } from '../handler.js';

function computeUnitCost(cartonCost, unitsPerCarton) {
  const units = Number(unitsPerCarton || 0);
  const carton = Number(cartonCost || 0);
  if (!units || units <= 0) return carton || 0;
  return Math.round((carton / units) * 10000) / 10000;
}

async function attachPackaging(rows) {
  const list = Array.isArray(rows) ? rows : rows ? [rows] : [];
  if (!list.length) return list;
  const ids = list.map((r) => r.id);
  const { data: packs } = await supabase.from('product_packaging').select('*').in('product_id', ids);
  const map = Object.fromEntries((packs || []).map((p) => [p.product_id, p]));
  return list.map((r) => {
    const pack = map[r.id];
    return {
      ...r,
      units_per_carton: pack ? Number(pack.units_per_carton) : 1,
      carton_cost: pack ? Number(pack.carton_cost) : Number(r.cost || 0),
      unit_cost: pack ? Number(pack.unit_cost) : Number(r.cost || 0),
    };
  });
}

async function upsertPackaging(productId, tenantId, unitsPerCarton, cartonCost, unitCost) {
  const { data: existing } = await supabase
    .from('product_packaging')
    .select('id')
    .eq('product_id', productId)
    .maybeSingle();

  const payload = {
    product_id: productId,
    tenant_id: tenantId,
    units_per_carton: unitsPerCarton,
    carton_cost: cartonCost,
    unit_cost: unitCost,
  };

  if (existing?.id) {
    await supabase.from('product_packaging').update(payload).eq('id', existing.id);
  } else {
    await supabase.from('product_packaging').insert(payload);
  }
}

export const handler = withApi(
  async function handler(req, res, { auth, tenantId }) {
    if (req.method === 'GET') {
      const { q, barcode, category, low_stock } = req.query;
      let query = supabase.from('products').select('*').order('name_ar', { ascending: true });
      if (tenantId) query = query.eq('tenant_id', tenantId);
      if (barcode) query = query.eq('barcode', barcode);
      if (category) query = query.eq('category', category);
      const { data, error } = await query;
      if (error) throw error;
      let rows = await attachPackaging(data || []);
      if (q) {
        const s = String(q).toLowerCase();
        rows = rows.filter(
          (p) =>
            p.name?.toLowerCase().includes(s) ||
            p.name_ar?.includes(q) ||
            p.sku?.toLowerCase().includes(s) ||
            p.barcode?.includes(q)
        );
      }
      if (low_stock === '1' || low_stock === 'true') {
        rows = rows.filter((p) => Number(p.stock) <= Number(p.min_stock));
      }
      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const tid = tenantId || body.tenant_id;
      const unitsPerCarton = Number(body.units_per_carton ?? 1) || 1;
      const cartonCost = Number(body.carton_cost ?? body.cost ?? 0);
      const cartons = Number(body.cartons ?? 0);
      const unitCost =
        body.unit_cost != null ? Number(body.unit_cost) : computeUnitCost(cartonCost, unitsPerCarton);
      const stockPieces = body.stock != null ? Number(body.stock) : cartons * unitsPerCarton;

      const { data, error } = await supabase
        .from('products')
        .insert({
          tenant_id: tid,
          name: body.name,
          name_ar: body.name_ar,
          sku: body.sku,
          barcode: body.barcode,
          category: body.category || 'عام',
          price: body.price ?? 0,
          cost: unitCost,
          stock: stockPieces,
          min_stock: body.min_stock ?? 5,
          unit: body.unit || 'حبة',
          image_url: body.image_url || null,
          is_active: body.is_active !== false,
        })
        .select()
        .single();
      if (error) throw error;

      await upsertPackaging(data.id, tid, unitsPerCarton, cartonCost, unitCost);
      const [enriched] = await attachPackaging([data]);
      return res.status(201).json(enriched);
    }

    if (req.method === 'PUT') {
      const { id, ...rest } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });

      const { data: current, error: cErr } = await supabase
        .from('products')
        .select('*')
        .eq('id', id)
        .single();
      if (cErr) throw cErr;
      if (tenantId && auth.role !== 'superadmin' && Number(current.tenant_id) !== Number(tenantId)) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const { data: pack } = await supabase
        .from('product_packaging')
        .select('*')
        .eq('product_id', id)
        .maybeSingle();

      let unitsPerCarton = Number(rest.units_per_carton ?? pack?.units_per_carton ?? 1) || 1;
      let cartonCost = Number(rest.carton_cost ?? pack?.carton_cost ?? current.cost ?? 0);
      let unitCost = Number(current.cost || 0);
      const patch = { ...rest };
      delete patch.units_per_carton;
      delete patch.carton_cost;
      delete patch.unit_cost;
      delete patch.cartons;
      delete patch.add_cartons;
      delete patch.tenant_id;

      if (rest.carton_cost != null || rest.units_per_carton != null) {
        unitCost = rest.unit_cost != null ? Number(rest.unit_cost) : computeUnitCost(cartonCost, unitsPerCarton);
        patch.cost = unitCost;
      }

      if (rest.add_cartons != null) {
        const add = Number(rest.add_cartons) * unitsPerCarton;
        patch.stock = Number(current.stock || 0) + add;
        if (rest.carton_cost != null) {
          unitCost = computeUnitCost(cartonCost, unitsPerCarton);
          patch.cost = unitCost;
        }
      }

      if (rest.cartons != null && rest.stock == null && rest.add_cartons == null) {
        patch.stock = Number(rest.cartons) * unitsPerCarton;
      }

      const { data, error } = await supabase.from('products').update(patch).eq('id', id).select().single();
      if (error) throw error;

      if (
        rest.units_per_carton != null ||
        rest.carton_cost != null ||
        rest.unit_cost != null ||
        rest.add_cartons != null
      ) {
        await upsertPackaging(id, current.tenant_id, unitsPerCarton, cartonCost, Number(patch.cost ?? unitCost));
      }

      const [enriched] = await attachPackaging([data]);
      return res.status(200).json(enriched);
    }

    if (req.method === 'DELETE') {
      if (auth.role === 'cashier') {
        return res.status(403).json({ error: 'Forbidden: cashiers cannot delete products' });
      }
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      await supabase.from('product_packaging').delete().eq('product_id', id);
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  },
  {
    permissions: {
      GET: 'products:read',
      POST: 'products:write',
      PUT: 'products:write',
      DELETE: 'products:write',
    },
  }
);
