-- Business-logic integrity fixes for the sales/inventory path. Idempotent.
--
-- BL-02/BL-09/BL-12: atomic stock movement.
--   The API previously read a product's stock then wrote (stock - qty) back, a
--   read-modify-write race that let concurrent cashiers oversell. This RPC does
--   the delta in a single locked UPDATE. `p_block_negative` lets a caller reject
--   a movement that would go below zero; the sales path passes false (store
--   policy = allow oversell, record the deficit) so oversells are auditable
--   rather than silently clamped to zero.
CREATE OR REPLACE FUNCTION public.pos_apply_stock_delta(
  p_product_id integer,
  p_delta numeric,
  p_block_negative boolean DEFAULT false
)
RETURNS TABLE (new_stock numeric, applied boolean)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_stock numeric;
BEGIN
  IF p_block_negative AND p_delta < 0 THEN
    UPDATE public.products
       SET stock = stock + p_delta,
           updated_at = now()
     WHERE id = p_product_id
       AND stock + p_delta >= 0
     RETURNING stock INTO v_stock;
    IF NOT FOUND THEN
      SELECT stock INTO v_stock FROM public.products WHERE id = p_product_id;
      RETURN QUERY SELECT COALESCE(v_stock, 0)::numeric, false;
      RETURN;
    END IF;
  ELSE
    UPDATE public.products
       SET stock = stock + p_delta,
           updated_at = now()
     WHERE id = p_product_id
     RETURNING stock INTO v_stock;
    IF NOT FOUND THEN
      RETURN QUERY SELECT 0::numeric, false;
      RETURN;
    END IF;
  END IF;
  RETURN QUERY SELECT v_stock, true;
END;
$$;

-- BL-06: link each sale to the cashier's open shift for X/Z reconciliation.
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS shift_id integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_shift_id_fkey'
  ) THEN
    ALTER TABLE public.sales
      ADD CONSTRAINT sales_shift_id_fkey
      FOREIGN KEY (shift_id) REFERENCES public.cashier_shifts(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS sales_shift_id_idx ON public.sales (shift_id);

-- BL-05: guarantee invoice-number uniqueness per (tenant, branch). branch_id is
-- coalesced to 0 so two branch-less sales cannot share a number (NULLs are
-- otherwise distinct in a unique index).
CREATE UNIQUE INDEX IF NOT EXISTS sales_tenant_branch_invoice_uidx
  ON public.sales (tenant_id, COALESCE(branch_id, 0), invoice_number);
