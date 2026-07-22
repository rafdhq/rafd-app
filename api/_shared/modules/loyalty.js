import { supabase } from '../db-client.js';
import { withApi } from '../handler.js';
import { methodNotAllowed } from '../auth-middleware.js';

const DEFAULT_PROGRAM = {
  enabled: true,
  points_per_currency: 1,
  redemption_rate: 100,
  min_redeem_points: 100,
  bronze_min: 0,
  silver_min: 500,
  gold_min: 2000,
  platinum_min: 5000,
  auto_offer_enabled: true,
};

function tierFromPoints(lifetime, program) {
  const p = { ...DEFAULT_PROGRAM, ...(program || {}) };
  const pts = Number(lifetime || 0);
  if (pts >= Number(p.platinum_min)) return 'platinum';
  if (pts >= Number(p.gold_min)) return 'gold';
  if (pts >= Number(p.silver_min)) return 'silver';
  return 'bronze';
}

async function getProgram(tenantId) {
  const { data } = await supabase
    .from('loyalty_programs')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('id', { ascending: true })
    .limit(1);
  if (data?.[0]) return data[0];
  const { data: created, error } = await supabase
    .from('loyalty_programs')
    .insert({ tenant_id: tenantId, ...DEFAULT_PROGRAM })
    .select()
    .single();
  if (error) throw error;
  return created;
}

async function getOrCreateAccount(tenantId, customerId) {
  const { data: existing } = await supabase
    .from('loyalty_accounts')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('customer_id', customerId)
    .maybeSingle();
  if (existing) return existing;
  const program = await getProgram(tenantId);
  const { data, error } = await supabase
    .from('loyalty_accounts')
    .insert({
      tenant_id: tenantId,
      customer_id: customerId,
      points_balance: 0,
      lifetime_points: 0,
      tier: tierFromPoints(0, program),
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export const handler = withApi(
  async function handler(req, res, { tenantId, auth }) {
    const tid = tenantId;

    if (req.method === 'GET') {
      const action = req.query.action || 'overview';
      const program = await getProgram(tid);

      if (action === 'program') return res.status(200).json(program);

      if (action === 'account') {
        const customerId = Number(req.query.customer_id);
        if (!customerId) return res.status(400).json({ error: 'customer_id required' });
        const account = await getOrCreateAccount(tid, customerId);
        const { data: ledger } = await supabase
          .from('loyalty_ledger')
          .select('*')
          .eq('tenant_id', tid)
          .eq('customer_id', customerId)
          .order('created_at', { ascending: false })
          .limit(50);
        const { data: offers } = await supabase
          .from('loyalty_offers')
          .select('*')
          .eq('tenant_id', tid)
          .eq('active', true)
          .order('id', { ascending: true });
        return res.status(200).json({ program, account, ledger: ledger || [], offers: offers || [] });
      }

      const [{ data: accounts }, { data: offers }, { data: ledger }] = await Promise.all([
        supabase.from('loyalty_accounts').select('*').eq('tenant_id', tid).order('lifetime_points', { ascending: false }),
        supabase.from('loyalty_offers').select('*').eq('tenant_id', tid).order('id', { ascending: false }),
        supabase.from('loyalty_ledger').select('*').eq('tenant_id', tid).order('created_at', { ascending: false }).limit(40),
      ]);

      return res.status(200).json({
        program,
        accounts: accounts || [],
        offers: offers || [],
        recent: ledger || [],
      });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const action = body.action || 'earn';

      if (action === 'update_program') {
        const program = await getProgram(tid);
        const { data, error } = await supabase
          .from('loyalty_programs')
          .update({
            enabled: body.enabled ?? program.enabled,
            points_per_currency: body.points_per_currency ?? program.points_per_currency,
            redemption_rate: body.redemption_rate ?? program.redemption_rate,
            min_redeem_points: body.min_redeem_points ?? program.min_redeem_points,
            bronze_min: body.bronze_min ?? program.bronze_min,
            silver_min: body.silver_min ?? program.silver_min,
            gold_min: body.gold_min ?? program.gold_min,
            platinum_min: body.platinum_min ?? program.platinum_min,
            auto_offer_enabled: body.auto_offer_enabled ?? program.auto_offer_enabled,
          })
          .eq('id', program.id)
          .select()
          .single();
        if (error) throw error;
        return res.status(200).json(data);
      }

      if (action === 'create_offer') {
        const { data, error } = await supabase
          .from('loyalty_offers')
          .insert({
            tenant_id: tid,
            title: body.title,
            title_en: body.title_en || null,
            description: body.description || null,
            offer_type: body.offer_type || 'percent',
            value: body.value ?? 0,
            min_tier: body.min_tier || 'bronze',
            min_points: body.min_points ?? 0,
            active: body.active !== false,
          })
          .select()
          .single();
        if (error) throw error;
        return res.status(201).json(data);
      }

      if (action === 'earn' || action === 'redeem' || action === 'adjust') {
        const customerId = Number(body.customer_id);
        const points = Math.abs(Number(body.points || 0));
        if (!customerId || !points) return res.status(400).json({ error: 'customer_id and points required' });

        const program = await getProgram(tid);
        if (!program.enabled && action !== 'adjust') {
          return res.status(400).json({ error: 'Loyalty program disabled' });
        }

        const account = await getOrCreateAccount(tid, customerId);
        let balance = Number(account.points_balance || 0);
        let lifetime = Number(account.lifetime_points || 0);

        if (action === 'earn') {
          balance += points;
          lifetime += points;
        } else if (action === 'redeem') {
          if (points < Number(program.min_redeem_points || 0)) {
            return res.status(400).json({ error: 'Below minimum redeem points' });
          }
          if (points > balance) return res.status(400).json({ error: 'Insufficient points' });
          balance -= points;
        } else {
          balance = Math.max(0, points);
        }

        const tier = tierFromPoints(lifetime, program);
        const { data: updated, error: uErr } = await supabase
          .from('loyalty_accounts')
          .update({
            points_balance: balance,
            lifetime_points: lifetime,
            tier,
            updated_at: new Date().toISOString(),
          })
          .eq('id', account.id)
          .select()
          .single();
        if (uErr) throw uErr;

        const { data: entry, error: lErr } = await supabase
          .from('loyalty_ledger')
          .insert({
            tenant_id: tid,
            customer_id: customerId,
            type: action,
            points: action === 'redeem' ? -points : points,
            balance_after: balance,
            reference: body.reference || null,
            sale_id: body.sale_id || null,
            notes: body.notes || null,
          })
          .select()
          .single();
        if (lErr) throw lErr;

        try {
          await supabase.from('audit_logs').insert({
            tenant_id: tid,
            actor_email: auth?.profile?.email || auth?.user?.email || null,
            action: `loyalty.${action}`,
            entity: 'loyalty_accounts',
            entity_id: String(account.id),
            meta: { customer_id: customerId, points, balance },
          });
        } catch {
          /* audit optional */
        }

        return res.status(200).json({ account: updated, entry, program });
      }

      return res.status(400).json({ error: 'Unknown action' });
    }

    if (req.method === 'PUT') {
      const { id, ...rest } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      const { data, error } = await supabase
        .from('loyalty_offers')
        .update(rest)
        .eq('id', id)
        .eq('tenant_id', tid)
        .select()
        .single();
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      const id = req.body?.id || req.query?.id;
      if (!id) return res.status(400).json({ error: 'id required' });
      const { error } = await supabase.from('loyalty_offers').delete().eq('id', id).eq('tenant_id', tid);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return methodNotAllowed(res);
  },
  {
    permissions: {
      GET: 'loyalty:read',
      POST: 'loyalty:write',
      PUT: 'loyalty:write',
      DELETE: 'loyalty:write',
    },
  }
);
