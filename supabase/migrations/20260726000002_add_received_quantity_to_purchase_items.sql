-- Add received_quantity to purchase_items for partial receipt tracking
ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS received_quantity NUMERIC DEFAULT 0;
