-- Add sell_by_weight flag to products for reliable weight-product detection
ALTER TABLE products ADD COLUMN IF NOT EXISTS sell_by_weight BOOLEAN DEFAULT false;
