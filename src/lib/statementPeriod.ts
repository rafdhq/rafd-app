import type { CustomerLedger, Sale } from './types';

export type PeriodPreset = 'all' | 'today' | 'month' | 'year' | 'custom';

export interface PeriodRange {
  from: Date | null;
  to: Date | null;
  label: string;
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function resolvePeriod(
  preset: PeriodPreset,
  customFrom?: string,
  customTo?: string
): PeriodRange {
  const now = new Date();

  if (preset === 'today') {
    return {
      from: startOfDay(now),
      to: endOfDay(now),
      label: 'خلال اليوم',
    };
  }

  if (preset === 'month') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to = endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    return {
      from,
      to,
      label: `شهر ${now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
    };
  }

  if (preset === 'year') {
    const from = new Date(now.getFullYear(), 0, 1);
    const to = endOfDay(new Date(now.getFullYear(), 11, 31));
    return {
      from,
      to,
      label: `سنة ${now.getFullYear()}`,
    };
  }

  if (preset === 'custom') {
    const from = customFrom ? startOfDay(new Date(customFrom)) : null;
    const to = customTo ? endOfDay(new Date(customTo)) : null;
    return {
      from,
      to,
      label:
        from && to
          ? `من ${customFrom} إلى ${customTo}`
          : from
            ? `من ${customFrom}`
            : to
              ? `حتى ${customTo}`
              : 'فترة مخصصة',
    };
  }

  return { from: null, to: null, label: 'كل الفترات' };
}

function inRange(dateStr: string | null | undefined, from: Date | null, to: Date | null) {
  if (!dateStr) return false;
  const t = new Date(dateStr).getTime();
  if (Number.isNaN(t)) return false;
  if (from && t < from.getTime()) return false;
  if (to && t > to.getTime()) return false;
  return true;
}

function beforeRange(dateStr: string | null | undefined, from: Date | null) {
  if (!from || !dateStr) return false;
  const t = new Date(dateStr).getTime();
  if (Number.isNaN(t)) return false;
  return t < from.getTime();
}

/** Sort ledger oldest → newest */
export function sortLedgerAsc(ledger: CustomerLedger[]) {
  return [...ledger].sort(
    (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
  );
}

/**
 * Opening balance = last balance_after before period start.
 * If no prior movement: 0 (or reverse-calc from first in-period entry).
 */
export function computeStatementSlice(
  ledger: CustomerLedger[],
  sales: Sale[],
  range: PeriodRange
) {
  const asc = sortLedgerAsc(ledger);
  const { from, to } = range;

  let openingBalance = 0;
  if (from) {
    const prior = asc.filter((r) => beforeRange(r.created_at, from));
    if (prior.length) {
      openingBalance = Number(prior[prior.length - 1].balance_after || 0);
    } else if (asc.length) {
      // no prior rows — if first row is after/in range, opening is 0
      openingBalance = 0;
    }
  }

  const periodLedger = from || to
    ? asc.filter((r) => inRange(r.created_at, from, to))
    : asc;

  const periodSales = (from || to
    ? sales.filter((s) => inRange(s.created_at, from, to))
    : [...sales]
  ).sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());

  let closingBalance = openingBalance;
  if (periodLedger.length) {
    closingBalance = Number(periodLedger[periodLedger.length - 1].balance_after || openingBalance);
  } else if (!from && !to && asc.length) {
    closingBalance = Number(asc[asc.length - 1].balance_after || 0);
  }

  const periodDebit = periodLedger
    .filter((r) => r.type === 'sale_credit' || r.type === 'debit')
    .reduce((a, r) => a + Number(r.amount || 0), 0);
  const periodCredit = periodLedger
    .filter((r) => r.type === 'payment' || r.type === 'credit')
    .reduce((a, r) => a + Number(r.amount || 0), 0);

  const hasPriorActivity = from
    ? asc.some((r) => beforeRange(r.created_at, from))
    : false;

  return {
    openingBalance,
    closingBalance,
    periodLedger,
    periodSales,
    periodDebit,
    periodCredit,
    hasPriorActivity,
    showOpening: Boolean(from && hasPriorActivity),
  };
}
