export interface RecipeItem {
  ingredient_product_id: number;
  quantity: number;
  waste_pct?: number;
}

export interface Recipe {
  id: number;
  product_id: number;
  yield_qty?: number;
  items: RecipeItem[];
}

/** Net ingredient qty including waste for manufacturing `outputQty` finished units. */
export function ingredientNeed(item: RecipeItem, outputQty: number, yieldQty = 1) {
  const y = Number(yieldQty || 1) || 1;
  const base = (Number(item.quantity || 0) * Number(outputQty || 0)) / y;
  const waste = Number(item.waste_pct || 0) / 100;
  return base * (1 + waste);
}

export function explodeBom(recipe: Recipe, outputQty: number) {
  const y = Number(recipe.yield_qty || 1) || 1;
  return (recipe.items || []).map((it) => ({
    ingredient_product_id: it.ingredient_product_id,
    quantity: ingredientNeed(it, outputQty, y),
  }));
}

export function canManufacture(
  recipe: Recipe,
  outputQty: number,
  stockByProductId: Record<number, number>
) {
  const needs = explodeBom(recipe, outputQty);
  const missing = needs.filter((n) => Number(stockByProductId[n.ingredient_product_id] || 0) < n.quantity);
  return { ok: missing.length === 0, needs, missing };
}

/** When a finished good with BOM is sold, deduct ingredients instead of (or in addition to) FG stock. */
export function saleIngredientDeductions(
  recipesByProductId: Record<number, Recipe>,
  soldLines: Array<{ product_id: number; quantity: number }>
) {
  const deduct: Record<number, number> = {};
  for (const line of soldLines) {
    const recipe = recipesByProductId[line.product_id];
    if (!recipe) continue;
    for (const need of explodeBom(recipe, Number(line.quantity || 0))) {
      deduct[need.ingredient_product_id] =
        (deduct[need.ingredient_product_id] || 0) + need.quantity;
    }
  }
  return deduct;
}
