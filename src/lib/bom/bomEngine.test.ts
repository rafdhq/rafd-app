import { describe, expect, it } from 'vitest';
import { canManufacture, explodeBom, saleIngredientDeductions } from './bomEngine';

const recipe = {
  id: 1,
  product_id: 99,
  yield_qty: 1,
  items: [
    { ingredient_product_id: 1, quantity: 2, waste_pct: 0 },
    { ingredient_product_id: 2, quantity: 1, waste_pct: 10 },
  ],
};

describe('BOM engine', () => {
  it('explodes ingredients with waste', () => {
    const needs = explodeBom(recipe, 5);
    expect(needs.find((n) => n.ingredient_product_id === 1)?.quantity).toBe(10);
    expect(needs.find((n) => n.ingredient_product_id === 2)?.quantity).toBeCloseTo(5.5);
  });

  it('validates stock for manufacture', () => {
    const ok = canManufacture(recipe, 2, { 1: 10, 2: 10 });
    expect(ok.ok).toBe(true);
    const bad = canManufacture(recipe, 2, { 1: 1, 2: 10 });
    expect(bad.ok).toBe(false);
  });

  it('computes sale ingredient deductions', () => {
    const d = saleIngredientDeductions({ 99: recipe }, [{ product_id: 99, quantity: 2 }]);
    expect(d[1]).toBe(4);
  });
});
