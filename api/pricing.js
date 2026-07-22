import supabase from './db-client.js';
import { withApi } from './_handler.js';
import { methodNotAllowed } from './auth-middleware.js';

const PRESETS = [
  { code: 'retail', name: 'قطاعي', name_en: 'Retail', is_default: true },
  { code: 'half_wholesale', name: 'نصف جملة', name_en: 'Half wholesale', is_default: false },
  { code: 'wholesale', name: 'جملة', name_en: 'Wholesale', is_default: false },
  { code: 'vip', name: 'VIP', name_en: 'VIP', is_default: false },
];

async function ensureLists(tenantId) {
  const { data: existing } = await supabase.from('price_lists').select('*').eq('tenant_id', tenantId);
  if (existing?.length) return existing;
  const rows = PRESETS.map((p) => ({
    tenant_id: tenantId,
    code: p.code,
    name: p.name,
    name_en: p.name_en,
    is_default: p.is_default,
    active: true,
  }));
  const { data, error } = await supabase.from('price_lists').insert(rows).select();
  if (error) throw error;
  return data;
}

function resolvePrice({
  productId,
  basePrice,
  priceLists,
  productPrices,
  customerOverrides,
  branchOverrides,
  priceListCode,
  priceListId,
  customerId,
  branchId,
}) {
  if (customerId) {
    const c = (customerOverrides || []).find(
      (o) => Number(o.customer_id) === Number(customerId) && Number(o.product_id) === Number(productId)
    );
    if (c) return { price: Number(c.price), source: 'customer', price_list_id: null };
  }
  if (branchId) {
    const b = (branchOverrides || []).find(
      (o) => Number(o.branch_id) === Number(branchId) && Number(o.product_id) === Number(productId) && o.price != null
    );
    if (b) return { price: Number(b.price), source: 'branch', price_list_id: b.price_list_id || null };
  }
  let list = null;
  if (priceListId) list = priceLists.find((l) => Number(l.id) === Number(priceListId));
  if (!list && priceListCode) list = priceLists.find((l) => l.code === priceListCode);
  if (!list) list = priceLists.find((l) => l.is_default) || priceLists[0];
  if (list) {
    const row = (productPrices || []).find(
      (p) => Number(p.product_id) === Number(productId) && Number(p.price_list_id) === Number(list.id)
    );
    if (row) return { price: Number(row.price), source: `list:${list.code}`, price_list_id: list.id };
  }
  return { price: Number(basePrice || 0), source: 'base', price_list_id: list?.id || null };
}

export default withApi(
  async function handler(req, res, { tenantId }) {
    const tid = tenantId;

    if (req.method === 'GET') {
      const lists = await ensureLists(tid);
      const action = req.query.action || 'lists';

      if (action === 'resolve') {
        const productId = Number(req.query.product_id);
        const [{ data: product }, { data: productPrices }, { data: customerOverrides }, { data: branchOverrides }] =
          await Promise.all([
            supabase.from('products').select('id, price').eq('id', productId).eq('tenant_id', tid).maybeSingle(),
            supabase.from('product_prices').select('*').eq('tenant_id', tid).eq('product_id', productId),
            supabase.from('customer_price_overrides').select('*').eq('tenant_id', tid).eq('product_id', productId),
            supabase.from('branch_price_overrides').select('*').eq('tenant_id', tid).eq('product_id', productId),
          ]);
        if (!product) return res.status(404).json({ error: 'Product not found' });
        const resolved = resolvePrice({
          productId,
          basePrice: product.price,
          priceLists: lists,
          productPrices: productPrices || [],
          customerOverrides: customerOverrides || [],
          branchOverrides: branchOverrides || [],
          priceListCode: req.query.price_list_code,
          priceListId: req.query.price_list_id ? Number(req.query.price_list_id) : null,
          customerId: req.query.customer_id ? Number(req.query.customer_id) : null,
          branchId: req.query.branch_id ? Number(req.query.branch_id) : null,
        });
        return res.status(200).json(resolved);
      }

      const [{ data: productPrices }, { data: customerOverrides }, { data: branchOverrides }, { data: products }] =
        await Promise.all([
          supabase.from('product_prices').select('*').eq('tenant_id', tid),
          supabase.from('customer_price_overrides').select('*').eq('tenant_id', tid),
          supabase.from('branch_price_overrides').select('*').eq('tenant_id', tid),
          supabase.from('products').select('id, name, name_ar, price, sku').eq('tenant_id', tid).order('name_ar'),
        ]);

      return res.status(200).json({
        lists,
        product_prices: productPrices || [],
        customer_overrides: customerOverrides || [],
        branch_overrides: branchOverrides || [],
        products: products || [],
      });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const action = body.action || 'set_product_price';
      await ensureLists(tid);

      if (action === 'set_product_price') {
        const productId = Number(body.product_id);
        const priceListId = Number(body.price_list_id);
        const price = Number(body.price);
        if (!productId || !priceListId) return res.status(400).json({ error: 'product_id and price_list_id required' });
        const { data: existing } = await supabase
          .from('product_prices')
          .select('id')
          .eq('tenant_id', tid)
          .eq('product_id', productId)
          .eq('price_list_id', priceListId)
          .maybeSingle();
        if (existing?.id) {
          const { data, error } = await supabase
            .from('product_prices')
            .update({ price })
            .eq('id', existing.id)
            .select()
            .single();
          if (error) throw error;
          return res.status(200).json(data);
        }
        const { data, error } = await supabase
          .from('product_prices')
          .insert({ tenant_id: tid, product_id: productId, price_list_id: priceListId, price })
          .select()
          .single();
        if (error) throw error;
        return res.status(201).json(data);
      }

      if (action === 'seed_from_base') {
        const lists = await ensureLists(tid);
        const { data: products } = await supabase.from('products').select('id, price').eq('tenant_id', tid);
        const factors = {
          retail: 1,
          half_wholesale: 0.92,
          wholesale: 0.85,
          vip: 0.9,
        };
        const rows = [];
        for (const p of products || []) {
          for (const list of lists) {
            const f = factors[list.code] ?? 1;
            rows.push({
              tenant_id: tid,
              product_id: p.id,
              price_list_id: list.id,
              price: Math.round(Number(p.price || 0) * f),
            });
          }
        }
        // clear and reinsert for tenant simplicity
        await supabase.from('product_prices').delete().eq('tenant_id', tid);
        if (rows.length) {
          const chunk = 500;
          for (let i = 0; i < rows.length; i += chunk) {
            const { error } = await supabase.from('product_prices').insert(rows.slice(i, i + chunk));
            if (error) throw error;
          }
        }
        return res.status(200).json({ ok: true, count: rows.length });
      }

      if (action === 'customer_override') {
        const { data, error } = await supabase
          .from('customer_price_overrides')
          .insert({
            tenant_id: tid,
            customer_id: body.customer_id,
            product_id: body.product_id,
            price: body.price,
          })
          .select()
          .single();
        if (error) throw error;
        return res.status(201).json(data);
      }

      if (action === 'branch_override') {
        const { data, error } = await supabase
          .from('branch_price_overrides')
          .insert({
            tenant_id: tid,
            branch_id: body.branch_id,
            product_id: body.product_id,
            price_list_id: body.price_list_id || null,
            price: body.price ?? null,
          })
          .select()
          .single();
        if (error) throw error;
        return res.status(201).json(data);
      }

      return res.status(400).json({ error: 'Unknown action' });
    }

    if (req.method === 'DELETE') {
      const body = req.body || {};
      if (body.type === 'product_price' && body.id) {
        await supabase.from('product_prices').delete().eq('id', body.id).eq('tenant_id', tid);
      } else if (body.type === 'customer_override' && body.id) {
        await supabase.from('customer_price_overrides').delete().eq('id', body.id).eq('tenant_id', tid);
      } else if (body.type === 'branch_override' && body.id) {
        await supabase.from('branch_price_overrides').delete().eq('id', body.id).eq('tenant_id', tid);
      } else {
        return res.status(400).json({ error: 'type and id required' });
      }
      return res.status(200).json({ ok: true });
    }

    return methodNotAllowed(res);
  },
  {
    permissions: {
      GET: 'pricing:read',
      POST: 'pricing:write',
      DELETE: 'pricing:write',
    },
  }
);
