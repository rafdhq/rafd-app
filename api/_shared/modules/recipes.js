import { supabase } from '../db-client.js';
import { withApi } from '../handler.js';
import { methodNotAllowed } from '../auth-middleware.js';

function explode(items, outputQty, yieldQty = 1) {
  const y = Number(yieldQty || 1) || 1;
  return (items || []).map((it) => {
    const base = (Number(it.quantity || 0) * Number(outputQty || 0)) / y;
    const waste = Number(it.waste_pct || 0) / 100;
    return {
      ingredient_product_id: it.ingredient_product_id,
      quantity: base * (1 + waste),
    };
  });
}

export const handler = withApi(
  async function handler(req, res, { tenantId, auth }) {
    const tid = tenantId;

    if (req.method === 'GET') {
      const { data: recipes, error } = await supabase
        .from('recipes')
        .select('*')
        .eq('tenant_id', tid)
        .order('id', { ascending: false });
      if (error) throw error;
      const ids = (recipes || []).map((r) => r.id);
      let items = [];
      if (ids.length) {
        const { data } = await supabase.from('recipe_items').select('*').in('recipe_id', ids);
        items = data || [];
      }
      const byRecipe = {};
      for (const it of items) {
        if (!byRecipe[it.recipe_id]) byRecipe[it.recipe_id] = [];
        byRecipe[it.recipe_id].push(it);
      }
      const enriched = (recipes || []).map((r) => ({ ...r, items: byRecipe[r.id] || [] }));

      if (req.query.id) {
        const one = enriched.find((r) => Number(r.id) === Number(req.query.id));
        return res.status(200).json(one || null);
      }
      return res.status(200).json(enriched);
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const action = body.action || 'create';

      if (action === 'create') {
        const { data: recipe, error } = await supabase
          .from('recipes')
          .insert({
            tenant_id: tid,
            product_id: body.product_id,
            name: body.name,
            name_en: body.name_en || null,
            yield_qty: body.yield_qty ?? 1,
            notes: body.notes || null,
            active: body.active !== false,
          })
          .select()
          .single();
        if (error) throw error;

        const items = Array.isArray(body.items) ? body.items : [];
        if (items.length) {
          const rows = items.map((it) => ({
            tenant_id: tid,
            recipe_id: recipe.id,
            ingredient_product_id: it.ingredient_product_id,
            quantity: it.quantity,
            unit: it.unit || 'حبة',
            waste_pct: it.waste_pct ?? 0,
          }));
          const { error: iErr } = await supabase.from('recipe_items').insert(rows);
          if (iErr) throw iErr;
        }
        return res.status(201).json(recipe);
      }

      if (action === 'manufacture') {
        const recipeId = Number(body.recipe_id);
        const qty = Number(body.quantity || 1);
        if (!recipeId || qty <= 0) return res.status(400).json({ error: 'recipe_id and quantity required' });

        const { data: recipe, error } = await supabase
          .from('recipes')
          .select('*')
          .eq('id', recipeId)
          .eq('tenant_id', tid)
          .single();
        if (error) throw error;

        const { data: items } = await supabase.from('recipe_items').select('*').eq('recipe_id', recipeId);
        const needs = explode(items || [], qty, recipe.yield_qty);

        // validate stock
        for (const need of needs) {
          const { data: prod } = await supabase
            .from('products')
            .select('id, stock, name_ar')
            .eq('id', need.ingredient_product_id)
            .eq('tenant_id', tid)
            .single();
          if (!prod || Number(prod.stock) < need.quantity) {
            return res.status(400).json({
              error: `Insufficient stock for ingredient ${prod?.name_ar || need.ingredient_product_id}`,
              need,
            });
          }
        }

        const { data: order, error: oErr } = await supabase
          .from('manufacturing_orders')
          .insert({
            tenant_id: tid,
            branch_id: body.branch_id || null,
            recipe_id: recipeId,
            product_id: recipe.product_id,
            quantity: qty,
            status: 'posted',
            notes: body.notes || null,
            created_by: auth?.profile?.full_name || auth?.user?.email || null,
            posted_at: new Date().toISOString(),
          })
          .select()
          .single();
        if (oErr) throw oErr;

        // deduct ingredients
        for (const need of needs) {
          const { data: prod } = await supabase
            .from('products')
            .select('stock')
            .eq('id', need.ingredient_product_id)
            .single();
          await supabase
            .from('products')
            .update({ stock: Math.max(0, Number(prod.stock) - need.quantity) })
            .eq('id', need.ingredient_product_id);
        }

        // add finished goods
        const { data: fg } = await supabase.from('products').select('stock').eq('id', recipe.product_id).single();
        if (fg) {
          await supabase
            .from('products')
            .update({ stock: Number(fg.stock || 0) + qty })
            .eq('id', recipe.product_id);
        }

        try {
          await supabase.from('audit_logs').insert({
            tenant_id: tid,
            actor_email: auth?.profile?.email || null,
            action: 'manufacturing.post',
            entity: 'manufacturing_orders',
            entity_id: String(order.id),
            meta: { recipe_id: recipeId, quantity: qty, needs },
          });
        } catch {
          /* optional */
        }

        return res.status(201).json({ order, needs });
      }

      return res.status(400).json({ error: 'Unknown action' });
    }

    if (req.method === 'PUT') {
      const { id, items, ...rest } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      const { data, error } = await supabase
        .from('recipes')
        .update(rest)
        .eq('id', id)
        .eq('tenant_id', tid)
        .select()
        .single();
      if (error) throw error;
      if (Array.isArray(items)) {
        await supabase.from('recipe_items').delete().eq('recipe_id', id);
        if (items.length) {
          await supabase.from('recipe_items').insert(
            items.map((it) => ({
              tenant_id: tid,
              recipe_id: id,
              ingredient_product_id: it.ingredient_product_id,
              quantity: it.quantity,
              unit: it.unit || 'حبة',
              waste_pct: it.waste_pct ?? 0,
            }))
          );
        }
      }
      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      const id = req.body?.id || req.query?.id;
      if (!id) return res.status(400).json({ error: 'id required' });
      await supabase.from('recipe_items').delete().eq('recipe_id', id);
      await supabase.from('recipes').delete().eq('id', id).eq('tenant_id', tid);
      return res.status(200).json({ ok: true });
    }

    return methodNotAllowed(res);
  },
  {
    permissions: {
      GET: 'recipes:read',
      POST: 'recipes:write',
      PUT: 'recipes:write',
      DELETE: 'recipes:write',
    },
  }
);
