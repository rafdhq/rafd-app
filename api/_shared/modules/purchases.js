import supabase from '../db-client.js';
import { withApi } from '../handler.js';

async function attachItems(rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return list;
  const ids = list.map((r) => r.id);
  const { data: items } = await supabase.from('purchase_items').select('*').in('purchase_id', ids);
  const map = {};
  for (const it of items || []) {
    if (!map[it.purchase_id]) map[it.purchase_id] = [];
    map[it.purchase_id].push(it);
  }
  return list.map((r) => ({ ...r, items: map[r.id] || [] }));
}

async function applySupplierBalance({ tenantId, supplierId, total, paid, reference, purchaseId, notes }) {
  if (!supplierId) return;
  const credit = Math.max(0, Number(total || 0) - Number(paid || 0));
  if (credit <= 0 && Number(paid || 0) <= 0) return;

  const { data: supplier } = await supabase.from('suppliers').select('*').eq('id', supplierId).single();
  if (!supplier) return;

  let balance = Number(supplier.balance || 0);
  if (credit > 0) {
    balance += credit;
    await supabase.from('suppliers').update({ balance }).eq('id', supplierId);
    await supabase.from('supplier_ledger').insert({
      tenant_id: tenantId,
      supplier_id: supplierId,
      type: 'purchase_credit',
      amount: credit,
      balance_after: balance,
      reference,
      notes: notes || 'مشترى / طلبية',
      purchase_id: purchaseId,
    });
  }
}

async function receiveStock(items) {
  for (const it of items || []) {
    if (!it.product_id) continue;
    const qty = Number(it.quantity || 0);
    if (qty <= 0) continue;
    const { data: prod } = await supabase.from('products').select('stock, cost').eq('id', it.product_id).single();
    if (!prod) continue;
    const patch = { stock: Number(prod.stock || 0) + qty };
    if (it.unit_cost != null) patch.cost = Number(it.unit_cost);
    await supabase.from('products').update(patch).eq('id', it.product_id);

    if (it.units_per_carton && it.unit_cost != null) {
      const upc = Number(it.units_per_carton) || 1;
      const cartonCost = Number(it.unit_cost) * upc;
      const { data: existing } = await supabase
        .from('product_packaging')
        .select('id')
        .eq('product_id', it.product_id)
        .maybeSingle();
      const pack = {
        product_id: it.product_id,
        units_per_carton: upc,
        carton_cost: cartonCost,
        unit_cost: Number(it.unit_cost),
      };
      if (existing?.id) await supabase.from('product_packaging').update(pack).eq('id', existing.id);
      else await supabase.from('product_packaging').insert(pack);
    }
  }
}

export default withApi(
  async function handler(req, res, { tenantId }) {
    if (req.method === 'GET') {
      const { id, supplier_id, status } = req.query;
      let q = supabase.from('purchases').select('*').order('purchase_date', { ascending: false });
      if (tenantId) q = q.eq('tenant_id', tenantId);
      if (id) q = q.eq('id', id);
      if (supplier_id) q = q.eq('supplier_id', supplier_id);
      if (status) q = q.eq('status', status);
      const { data, error } = await q;
      if (error) throw error;
      const withItems = await attachItems(data || []);
      if (id) return res.status(200).json(withItems[0] || null);
      return res.status(200).json(withItems);
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const items = Array.isArray(body.items) ? body.items : [];
      let total = Number(body.total ?? 0);
      if (!total && items.length) {
        total = items.reduce((a, it) => a + Number(it.total || 0), 0);
      }
      const paid = Number(body.paid ?? 0);
      const status = body.status || 'pending';

      const { data: purchase, error } = await supabase
        .from('purchases')
        .insert({
          tenant_id: tenantId || body.tenant_id,
          supplier_id: body.supplier_id || null,
          supplier_name: body.supplier_name || null,
          reference: body.reference || `PO-${Date.now().toString().slice(-6)}`,
          total,
          paid,
          status,
          purchase_date: body.purchase_date || new Date().toISOString().slice(0, 10),
          notes: body.notes || null,
        })
        .select()
        .single();
      if (error) throw error;

      if (items.length) {
        const rows = items.map((it) => ({
          purchase_id: purchase.id,
          product_id: it.product_id || null,
          product_name: it.product_name,
          quantity: Number(it.quantity || 0),
          unit: it.unit || 'حبة',
          unit_cost: Number(it.unit_cost || 0),
          total: Number(it.total || 0),
          units_per_carton: Number(it.units_per_carton || 1),
          cartons: Number(it.cartons || 0),
        }));
        const { error: iErr } = await supabase.from('purchase_items').insert(rows);
        if (iErr) throw iErr;
      }

      if (status === 'received') {
        const { data: savedItems } = await supabase
          .from('purchase_items')
          .select('*')
          .eq('purchase_id', purchase.id);
        await receiveStock(savedItems || items);
        await applySupplierBalance({
          tenantId: purchase.tenant_id,
          supplierId: purchase.supplier_id,
          total: purchase.total,
          paid: purchase.paid,
          reference: purchase.reference,
          purchaseId: purchase.id,
          notes: 'استلام مشترى',
        });
        try {
          await supabase.from('audit_logs').insert({
            tenant_id: purchase.tenant_id,
            action: 'purchase.receive',
            entity_type: 'purchases',
            entity_id: String(purchase.id),
            meta: { total: purchase.total, items: items.length },
          });
        } catch {
          /* ignore */
        }
      }

      const [full] = await attachItems([purchase]);
      return res.status(201).json(full);
    }

    if (req.method === 'PUT') {
      const { id, items, receive, pay_amount, ...rest } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });

      const { data: current, error: cErr } = await supabase.from('purchases').select('*').eq('id', id).single();
      if (cErr) throw cErr;
      if (tenantId && Number(current.tenant_id) !== Number(tenantId)) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      if (Array.isArray(items)) {
        await supabase.from('purchase_items').delete().eq('purchase_id', id);
        if (items.length) {
          await supabase.from('purchase_items').insert(
            items.map((it) => ({
              purchase_id: id,
              product_id: it.product_id || null,
              product_name: it.product_name,
              quantity: Number(it.quantity || 0),
              unit: it.unit || 'حبة',
              unit_cost: Number(it.unit_cost || 0),
              total: Number(it.total || 0),
              units_per_carton: Number(it.units_per_carton || 1),
              cartons: Number(it.cartons || 0),
            }))
          );
          if (rest.total == null) {
            rest.total = items.reduce((a, it) => a + Number(it.total || 0), 0);
          }
        }
      }

      if (receive || rest.status === 'received') {
        rest.status = 'received';
        if (current.status !== 'received') {
          const { data: savedItems } = await supabase
            .from('purchase_items')
            .select('*')
            .eq('purchase_id', id);
          await receiveStock(savedItems || []);
          await applySupplierBalance({
            tenantId: current.tenant_id,
            supplierId: current.supplier_id,
            total: rest.total ?? current.total,
            paid: rest.paid ?? current.paid,
            reference: current.reference,
            purchaseId: id,
            notes: 'استلام طلبية',
          });
          try {
            await supabase.from('audit_logs').insert({
              tenant_id: current.tenant_id,
              action: 'purchase.receive',
              entity_type: 'purchases',
              entity_id: String(id),
              meta: { from_status: current.status },
            });
          } catch {
            /* ignore */
          }
        }
      }

      if (pay_amount != null && Number(pay_amount) > 0) {
        const pay = Number(pay_amount);
        const newPaid = Number(current.paid || 0) + pay;
        rest.paid = newPaid;
        const { data: supplier } = await supabase
          .from('suppliers')
          .select('*')
          .eq('id', current.supplier_id)
          .single();
        if (supplier) {
          const balance = Math.max(0, Number(supplier.balance || 0) - pay);
          await supabase.from('suppliers').update({ balance }).eq('id', supplier.id);
          await supabase.from('supplier_ledger').insert({
            tenant_id: current.tenant_id,
            supplier_id: supplier.id,
            type: 'payment',
            amount: pay,
            balance_after: balance,
            reference: current.reference,
            notes: 'سداد للمورد',
            purchase_id: id,
          });
        }
      }

      const { data, error } = await supabase.from('purchases').update(rest).eq('id', id).select().single();
      if (error) throw error;
      const [full] = await attachItems([data]);
      return res.status(200).json(full);
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      await supabase.from('purchase_items').delete().eq('purchase_id', id);
      const { error } = await supabase.from('purchases').delete().eq('id', id).eq('tenant_id', tenantId);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  },
  {
    permissions: {
      GET: 'purchases:read',
      POST: 'purchases:write',
      PUT: 'purchases:write',
      DELETE: 'purchases:write',
    },
  }
);
