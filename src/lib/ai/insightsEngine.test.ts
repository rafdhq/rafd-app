import { describe, expect, it } from 'vitest';
import { analyzeRetail, answerManagerQuestion } from './insightsEngine';

const sample = {
  sales: [
    { id: 1, total: 1000, status: 'completed', created_at: new Date().toISOString() },
    { id: 2, total: 500, status: 'completed', created_at: new Date().toISOString() },
  ],
  products: [
    { id: 10, name_ar: 'حليب', price: 200, cost: 100, stock: 2, min_stock: 10, is_active: true },
    { id: 11, name_ar: 'راكد', price: 50, cost: 20, stock: 40, min_stock: 5, is_active: true },
  ],
  saleItems: [
    { sale_id: 1, product_id: 10, quantity: 5, total: 1000, unit_price: 200, product_name: 'حليب' },
  ],
  expenses: [{ amount: 100, expense_date: new Date().toISOString().slice(0, 10) }],
  locale: 'ar' as const,
};

describe('AI insights engine', () => {
  it('analyzes sales profit reorder and dead stock', () => {
    const a = analyzeRetail(sample);
    expect(a.stats.revenue_7d).toBe(1500);
    expect(a.reorderSuggestions.length).toBeGreaterThan(0);
    expect(a.deadStock.some((d) => d.id === 11)).toBe(true);
    expect(a.insights.length).toBeGreaterThan(2);
  });

  it('answers Arabic manager questions', () => {
    const a = analyzeRetail(sample);
    const ans = answerManagerQuestion('ما الأرباح؟', a);
    expect(ans).toContain('30');
  });
});
