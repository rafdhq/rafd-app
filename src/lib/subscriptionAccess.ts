export type SubscriptionPhase =
  | 'trial'
  | 'active'
  | 'pending_payment'
  | 'trial_ended'
  | 'subscription_ended'
  | 'expired'
  | 'suspended'
  | 'none';

export interface SubscriptionAccess {
  access: 'allowed' | 'blocked';
  reason: string;
  can_use_store: boolean;
  days_remaining: number;
  phase: SubscriptionPhase | string;
  ends_at?: string | null;
  effective_status?: string;
}

export interface TenantSubscription {
  id: number;
  tenant_id: number;
  plan_code: string;
  status: string;
  billing_cycle?: string | null;
  trial_starts_at?: string | null;
  trial_ends_at?: string | null;
  subscription_starts_at?: string | null;
  subscription_ends_at?: string | null;
  last_payment_at?: string | null;
  amount?: number | null;
  currency?: string | null;
  notes?: string | null;
}

export interface SubscriptionPayload {
  subscription: TenantSubscription;
  access: SubscriptionAccess;
  tenant?: unknown;
  plan?: {
    code: string;
    name?: string;
    name_ar?: string;
    price_monthly?: number;
    price_yearly?: number;
    currency?: string;
    features?: unknown;
    trial_days?: number;
  } | null;
  pending_payments?: Array<Record<string, unknown>>;
  settings?: {
    support_email?: string;
    support_phone?: string;
    support_whatsapp?: string;
    website?: string;
    trial_days?: number;
    app_name_ar?: string;
    logo_url?: string | null;
  } | null;
}

export function phaseLabel(phase?: string) {
  switch (phase) {
    case 'trial':
      return 'فترة تجريبية';
    case 'active':
      return 'اشتراك نشط';
    case 'pending_payment':
      return 'بانتظار اعتماد الدفع';
    case 'trial_ended':
      return 'انتهت التجربة';
    case 'subscription_ended':
      return 'انتهى الاشتراك';
    case 'expired':
      return 'منتهي';
    case 'suspended':
      return 'موقوف';
    default:
      return phase || '—';
  }
}

export function statusTone(phase?: string): 'success' | 'warning' | 'danger' | 'accent' | 'info' | 'primary' {
  if (phase === 'active') return 'success';
  if (phase === 'trial') return 'accent';
  if (phase === 'pending_payment') return 'warning';
  if (phase === 'suspended') return 'danger';
  if (phase === 'trial_ended' || phase === 'subscription_ended' || phase === 'expired') return 'danger';
  return 'info';
}
