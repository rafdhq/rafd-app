import { supabase } from '../db-client.js';

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + Number(days || 0));
  return d;
}

function daysLeft(end) {
  if (!end) return 0;
  const ms = new Date(end).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

function isPast(end) {
  if (!end) return true;
  return new Date(end).getTime() < Date.now();
}

async function getTrialDays(planCode) {
  const { data: settings } = await supabase
    .from('platform_settings')
    .select('trial_days')
    .order('id', { ascending: true })
    .limit(1);
  let trial = Number(settings?.[0]?.trial_days ?? 14);
  if (planCode) {
    const { data: plan } = await supabase
      .from('subscription_plans')
      .select('trial_days')
      .eq('code', planCode)
      .maybeSingle();
    if (plan?.trial_days != null) trial = Number(plan.trial_days);
  }
  return trial;
}

async function getPlan(code) {
  const { data } = await supabase.from('subscription_plans').select('*').eq('code', code).maybeSingle();
  return data;
}

async function ensureSubscription(tenantId, planCode = 'growth') {
  const { data: existing } = await supabase
    .from('tenant_subscriptions')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (existing) return existing;

  const trialDays = await getTrialDays(planCode);
  const now = new Date();
  const trialEnd = addDays(now, trialDays);
  const payload = {
    tenant_id: tenantId,
    plan_code: planCode || 'growth',
    status: trialDays > 0 ? 'trial' : 'expired',
    billing_cycle: 'monthly',
    trial_starts_at: now.toISOString(),
    trial_ends_at: trialEnd.toISOString(),
    subscription_starts_at: null,
    subscription_ends_at: null,
    amount: 0,
    currency: 'YER',
    notes: 'تجربة مجانية تلقائية',
    updated_at: now.toISOString(),
  };
  const { data, error } = await supabase.from('tenant_subscriptions').insert(payload).select().single();
  if (error) throw error;

  await supabase
    .from('tenants')
    .update({ status: payload.status === 'trial' ? 'trial' : 'expired', plan: planCode || 'growth' })
    .eq('id', tenantId);

  return data;
}

function normalizeAccess(sub) {
  if (!sub) {
    return {
      access: 'blocked',
      reason: 'no_subscription',
      can_use_store: false,
      days_remaining: 0,
      phase: 'none',
    };
  }

  let status = sub.status;
  let phase = status;
  let end = null;

  if (status === 'trial') {
    end = sub.trial_ends_at;
    if (isPast(end)) {
      status = 'expired';
      phase = 'trial_ended';
    } else {
      phase = 'trial';
    }
  } else if (status === 'active') {
    end = sub.subscription_ends_at;
    if (isPast(end)) {
      status = 'expired';
      phase = 'subscription_ended';
    } else {
      phase = 'active';
    }
  } else if (status === 'pending_payment') {
    phase = 'pending_payment';
    end = sub.subscription_ends_at || sub.trial_ends_at;
  } else if (status === 'suspended') {
    phase = 'suspended';
  } else {
    phase = 'expired';
    end = sub.subscription_ends_at || sub.trial_ends_at;
  }

  const can_use_store = phase === 'trial' || phase === 'active';
  const days_remaining = can_use_store ? daysLeft(end) : 0;

  return {
    access: can_use_store ? 'allowed' : 'blocked',
    reason: phase,
    can_use_store,
    days_remaining,
    phase,
    ends_at: end,
    effective_status: status,
  };
}

async function refreshExpired(sub) {
  if (!sub) return sub;
  const access = normalizeAccess(sub);
  if (
    (sub.status === 'trial' || sub.status === 'active') &&
    access.effective_status === 'expired'
  ) {
    const { data } = await supabase
      .from('tenant_subscriptions')
      .update({ status: 'expired', updated_at: new Date().toISOString(), notes: 'انتهت الفترة تلقائياً' })
      .eq('id', sub.id)
      .select()
      .single();
    await supabase.from('tenants').update({ status: 'expired' }).eq('id', sub.tenant_id);
    return data || { ...sub, status: 'expired' };
  }
  return sub;
}

export const handler = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    // -------- GET --------
    if (req.method === 'GET') {
      const { action, tenant_id, device_id, email, status } = req.query;

      if (action === 'check-device') {
        if (!device_id) return res.status(400).json({ error: 'device_id required' });
        const { data, error } = await supabase
          .from('device_bindings')
          .select('*')
          .eq('device_id', device_id)
          .order('id', { ascending: true });
        if (error) throw error;
        const bindings = data || [];
        const trialUsed = bindings.some((b) => b.trial_used !== false);
        const activeBinding = bindings.find((b) => b.status !== 'released') || bindings[0] || null;
        return res.status(200).json({
          blocked: trialUsed && !!activeBinding,
          trial_used: trialUsed,
          binding: activeBinding,
          bindings,
        });
      }

      if (action === 'payments') {
        let q = supabase
          .from('subscription_payments')
          .select('*')
          .order('created_at', { ascending: false });
        if (tenant_id) q = q.eq('tenant_id', tenant_id);
        if (status) q = q.eq('status', status);
        const { data, error } = await q.limit(200);
        if (error) throw error;
        return res.status(200).json(data || []);
      }

      if (action === 'devices') {
        let q = supabase.from('device_bindings').select('*').order('created_at', { ascending: false });
        if (tenant_id) q = q.eq('tenant_id', tenant_id);
        if (device_id) q = q.eq('device_id', device_id);
        if (email) q = q.eq('owner_email', String(email).toLowerCase());
        const { data, error } = await q.limit(200);
        if (error) throw error;
        return res.status(200).json(data || []);
      }

      // default: subscription status for tenant
      if (!tenant_id) return res.status(400).json({ error: 'tenant_id required' });
      let sub = await ensureSubscription(Number(tenant_id));
      sub = await refreshExpired(sub);
      const access = normalizeAccess(sub);

      const { data: tenant } = await supabase.from('tenants').select('*').eq('id', tenant_id).maybeSingle();
      const plan = await getPlan(sub.plan_code);
      const { data: pendingPayments } = await supabase
        .from('subscription_payments')
        .select('*')
        .eq('tenant_id', tenant_id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      const { data: settings } = await supabase
        .from('platform_settings')
        .select('*')
        .order('id', { ascending: true })
        .limit(1);

      return res.status(200).json({
        subscription: sub,
        access,
        tenant,
        plan,
        pending_payments: pendingPayments || [],
        settings: settings?.[0] || null,
      });
    }

    // -------- POST --------
    if (req.method === 'POST') {
      const body = req.body || {};
      const action = body.action || 'init-trial';

      if (action === 'init-trial') {
        if (!body.tenant_id) return res.status(400).json({ error: 'tenant_id required' });
        const sub = await ensureSubscription(Number(body.tenant_id), body.plan_code || 'growth');

        if (body.device_id) {
          const now = new Date().toISOString();
          const { data: existing } = await supabase
            .from('device_bindings')
            .select('*')
            .eq('device_id', body.device_id)
            .maybeSingle();
          if (existing && existing.tenant_id !== Number(body.tenant_id) && existing.trial_used !== false) {
            return res.status(409).json({
              error: 'هذا الجهاز مرتبط بفترة تجريبية سابقة. تواصل مع الإدارة للتفعيل.',
              code: 'DEVICE_TRIAL_USED',
              binding: existing,
            });
          }
          if (existing) {
            await supabase
              .from('device_bindings')
              .update({
                tenant_id: body.tenant_id,
                owner_email: (body.owner_email || existing.owner_email || '').toLowerCase() || null,
                owner_name: body.owner_name || existing.owner_name,
                store_name: body.store_name || existing.store_name,
                trial_used: true,
                status: 'active',
                last_seen_at: now,
              })
              .eq('id', existing.id);
          } else {
            await supabase.from('device_bindings').insert({
              device_id: body.device_id,
              tenant_id: body.tenant_id,
              owner_email: (body.owner_email || '').toLowerCase() || null,
              owner_name: body.owner_name || null,
              store_name: body.store_name || null,
              trial_used: true,
              status: 'active',
              last_seen_at: now,
            });
          }
        }

        return res.status(201).json({ subscription: sub, access: normalizeAccess(sub) });
      }

      if (action === 'check-device') {
        if (!body.device_id) return res.status(400).json({ error: 'device_id required' });
        const { data } = await supabase
          .from('device_bindings')
          .select('*')
          .eq('device_id', body.device_id)
          .order('id', { ascending: true });
        const bindings = data || [];
        const blocked = bindings.some((b) => b.trial_used !== false && b.status !== 'released');
        return res.status(200).json({
          blocked,
          binding: bindings.find((b) => b.status !== 'released') || null,
          bindings,
        });
      }

      if (action === 'select-plan') {
        const tenantId = Number(body.tenant_id);
        const planCode = body.plan_code;
        const cycle = body.billing_cycle === 'yearly' ? 'yearly' : 'monthly';
        if (!tenantId || !planCode) return res.status(400).json({ error: 'tenant_id and plan_code required' });

        const plan = await getPlan(planCode);
        if (!plan) return res.status(404).json({ error: 'الباقة غير موجودة' });

        let sub = await ensureSubscription(tenantId, planCode);
        sub = await refreshExpired(sub);
        const amount = cycle === 'yearly' ? Number(plan.price_yearly) : Number(plan.price_monthly);

        const { data, error } = await supabase
          .from('tenant_subscriptions')
          .update({
            plan_code: planCode,
            billing_cycle: cycle,
            amount,
            currency: plan.currency || 'YER',
            // keep trial/active until they pay if still valid; if expired go pending
            status:
              normalizeAccess(sub).can_use_store && sub.status !== 'expired'
                ? sub.status === 'active'
                  ? 'active'
                  : sub.status
                : 'pending_payment',
            updated_at: new Date().toISOString(),
            notes: `تم اختيار باقة ${plan.name_ar || plan.name} (${cycle})`,
          })
          .eq('id', sub.id)
          .select()
          .single();
        if (error) throw error;

        await supabase.from('tenants').update({ plan: planCode }).eq('id', tenantId);
        return res.status(200).json({ subscription: data, plan, access: normalizeAccess(data) });
      }

      if (action === 'submit-payment') {
        const tenantId = Number(body.tenant_id);
        if (!tenantId) return res.status(400).json({ error: 'tenant_id required' });
        if (!body.proof_url) return res.status(400).json({ error: 'يرجى رفع إثبات التحويل' });

        let sub = await ensureSubscription(tenantId, body.plan_code);
        const planCode = body.plan_code || sub.plan_code;
        const plan = await getPlan(planCode);
        const cycle = body.billing_cycle || sub.billing_cycle || 'monthly';
        const amount =
          body.amount != null
            ? Number(body.amount)
            : cycle === 'yearly'
              ? Number(plan?.price_yearly || 0)
              : Number(plan?.price_monthly || 0);

        const { data: payment, error } = await supabase
          .from('subscription_payments')
          .insert({
            tenant_id: tenantId,
            plan_code: planCode,
            billing_cycle: cycle,
            amount,
            currency: body.currency || plan?.currency || 'YER',
            payment_method_id: body.payment_method_id || null,
            payment_method_name: body.payment_method_name || null,
            proof_url: body.proof_url,
            sender_name: body.sender_name || null,
            reference: body.reference || null,
            status: 'pending',
            notes: body.notes || null,
          })
          .select()
          .single();
        if (error) throw error;

        const { data: updatedSub } = await supabase
          .from('tenant_subscriptions')
          .update({
            plan_code: planCode,
            billing_cycle: cycle,
            amount,
            status: normalizeAccess(sub).can_use_store ? sub.status : 'pending_payment',
            notes: 'بانتظار مراجعة إثبات الدفع',
            updated_at: new Date().toISOString(),
          })
          .eq('tenant_id', tenantId)
          .select()
          .single();

        await supabase.from('tenants').update({ plan: planCode }).eq('id', tenantId);

        // notify tenant
        await supabase.from('notifications').insert({
          tenant_id: tenantId,
          title: 'تم استلام طلب الاشتراك',
          body: 'تم رفع إثبات التحويل وبانتظار مصادقة الإدارة لتفعيل الباقة.',
          type: 'info',
          is_read: false,
        });

        return res.status(201).json({
          payment,
          subscription: updatedSub,
          access: normalizeAccess(updatedSub),
        });
      }

      if (action === 'review-payment') {
        const paymentId = Number(body.payment_id);
        const decision = body.decision; // approved | rejected
        if (!paymentId || !['approved', 'rejected'].includes(decision)) {
          return res.status(400).json({ error: 'payment_id and decision required' });
        }

        const { data: payment, error: pErr } = await supabase
          .from('subscription_payments')
          .select('*')
          .eq('id', paymentId)
          .single();
        if (pErr) throw pErr;

        const now = new Date();
        const { data: reviewed, error: rErr } = await supabase
          .from('subscription_payments')
          .update({
            status: decision,
            admin_notes: body.admin_notes || null,
            reviewed_by: body.reviewed_by || 'admin',
            reviewed_at: now.toISOString(),
          })
          .eq('id', paymentId)
          .select()
          .single();
        if (rErr) throw rErr;

        if (decision === 'approved') {
          const cycle = payment.billing_cycle === 'yearly' ? 'yearly' : 'monthly';
          const days = cycle === 'yearly' ? 365 : 30;
          const starts = now;
          const ends = addDays(starts, days);
          const { data: sub } = await supabase
            .from('tenant_subscriptions')
            .update({
              plan_code: payment.plan_code,
              billing_cycle: cycle,
              status: 'active',
              amount: payment.amount,
              currency: payment.currency,
              subscription_starts_at: starts.toISOString(),
              subscription_ends_at: ends.toISOString(),
              last_payment_at: now.toISOString(),
              notes: 'تم تفعيل الاشتراك بعد اعتماد التحويل',
              updated_at: now.toISOString(),
            })
            .eq('tenant_id', payment.tenant_id)
            .select()
            .single();

          await supabase
            .from('tenants')
            .update({ status: 'active', plan: payment.plan_code })
            .eq('id', payment.tenant_id);

          await supabase.from('notifications').insert({
            tenant_id: payment.tenant_id,
            title: 'تم تفعيل اشتراكك 🎉',
            body: `تم اعتماد التحويل وتفعيل باقة ${payment.plan_code} حتى ${ends.toLocaleDateString('ar')}.`,
            type: 'success',
            is_read: false,
          });

          return res.status(200).json({ payment: reviewed, subscription: sub, access: normalizeAccess(sub) });
        }

        // rejected
        await supabase
          .from('tenant_subscriptions')
          .update({
            status: 'expired',
            notes: body.admin_notes || 'تم رفض إثبات الدفع',
            updated_at: now.toISOString(),
          })
          .eq('tenant_id', payment.tenant_id);

        await supabase.from('tenants').update({ status: 'expired' }).eq('id', payment.tenant_id);

        await supabase.from('notifications').insert({
          tenant_id: payment.tenant_id,
          title: 'تعذر اعتماد التحويل',
          body: body.admin_notes || 'يرجى التحقق من الإثبات وإعادة الإرسال أو التواصل مع الدعم.',
          type: 'warning',
          is_read: false,
        });

        return res.status(200).json({ payment: reviewed });
      }

      if (action === 'admin-activate') {
        // manual activation without payment proof
        const tenantId = Number(body.tenant_id);
        const planCode = body.plan_code || 'growth';
        const days = Number(body.days || 30);
        if (!tenantId) return res.status(400).json({ error: 'tenant_id required' });
        await ensureSubscription(tenantId, planCode);
        const now = new Date();
        const ends = addDays(now, days);
        const { data: sub, error } = await supabase
          .from('tenant_subscriptions')
          .update({
            plan_code: planCode,
            status: 'active',
            billing_cycle: body.billing_cycle || 'monthly',
            subscription_starts_at: now.toISOString(),
            subscription_ends_at: ends.toISOString(),
            last_payment_at: now.toISOString(),
            notes: body.notes || 'تفعيل يدوي من الإدارة',
            updated_at: now.toISOString(),
          })
          .eq('tenant_id', tenantId)
          .select()
          .single();
        if (error) throw error;
        await supabase.from('tenants').update({ status: 'active', plan: planCode }).eq('id', tenantId);
        return res.status(200).json({ subscription: sub, access: normalizeAccess(sub) });
      }

      if (action === 'release-device') {
        const id = Number(body.id);
        if (!id) return res.status(400).json({ error: 'id required' });
        const { data, error } = await supabase
          .from('device_bindings')
          .update({ status: 'released', trial_used: body.allow_new_trial ? false : true })
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        return res.status(200).json(data);
      }

      return res.status(400).json({ error: 'Unknown action' });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('subscription API error:', err);
    res.status(500).json({ error: err.message });
  }
}
