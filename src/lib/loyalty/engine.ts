export type LoyaltyTier = 'bronze' | 'silver' | 'gold' | 'platinum';

export interface LoyaltyProgramConfig {
  enabled?: boolean;
  points_per_currency?: number;
  redemption_rate?: number; // points needed for 1 currency unit
  min_redeem_points?: number;
  bronze_min?: number;
  silver_min?: number;
  gold_min?: number;
  platinum_min?: number;
}

export const DEFAULT_LOYALTY: Required<LoyaltyProgramConfig> = {
  enabled: true,
  points_per_currency: 1,
  redemption_rate: 100,
  min_redeem_points: 100,
  bronze_min: 0,
  silver_min: 500,
  gold_min: 2000,
  platinum_min: 5000,
};

export function resolveTier(lifetimePoints: number, cfg: LoyaltyProgramConfig = {}): LoyaltyTier {
  const c = { ...DEFAULT_LOYALTY, ...cfg };
  const pts = Number(lifetimePoints || 0);
  if (pts >= c.platinum_min) return 'platinum';
  if (pts >= c.gold_min) return 'gold';
  if (pts >= c.silver_min) return 'silver';
  return 'bronze';
}

export function earnPoints(amountPaid: number, cfg: LoyaltyProgramConfig = {}) {
  const c = { ...DEFAULT_LOYALTY, ...cfg };
  if (!c.enabled) return 0;
  return Math.floor(Math.max(0, Number(amountPaid || 0)) * Number(c.points_per_currency || 0));
}

export function redeemValue(points: number, cfg: LoyaltyProgramConfig = {}) {
  const c = { ...DEFAULT_LOYALTY, ...cfg };
  const rate = Number(c.redemption_rate || 1) || 1;
  return Math.floor(Math.max(0, Number(points || 0)) / rate);
}

export function pointsForDiscount(discountAmount: number, cfg: LoyaltyProgramConfig = {}) {
  const c = { ...DEFAULT_LOYALTY, ...cfg };
  const rate = Number(c.redemption_rate || 1) || 1;
  return Math.ceil(Math.max(0, Number(discountAmount || 0)) * rate);
}

export function tierLabel(tier: string, locale: 'ar' | 'en' = 'ar') {
  const map: Record<string, { ar: string; en: string }> = {
    bronze: { ar: 'برونزي', en: 'Bronze' },
    silver: { ar: 'فضي', en: 'Silver' },
    gold: { ar: 'ذهبي', en: 'Gold' },
    platinum: { ar: 'بلاتيني', en: 'Platinum' },
  };
  return map[tier]?.[locale] || tier;
}

export function tierRank(tier: string) {
  return { bronze: 1, silver: 2, gold: 3, platinum: 4 }[tier] || 0;
}

export function canUseOffer(customerTier: string, minTier: string) {
  return tierRank(customerTier) >= tierRank(minTier || 'bronze');
}
