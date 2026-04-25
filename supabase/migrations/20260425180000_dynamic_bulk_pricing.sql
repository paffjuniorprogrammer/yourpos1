-- Add dynamic bulk pricing columns to products table
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS bulk_pricing_mode TEXT CHECK (bulk_pricing_mode IN ('fixed', 'discount_amount', 'discount_percentage')) DEFAULT 'fixed',
ADD COLUMN IF NOT EXISTS bulk_discount_value NUMERIC DEFAULT 0;

-- Update existing records to have a default pricing mode
UPDATE products SET bulk_pricing_mode = 'fixed' WHERE bulk_pricing_mode IS NULL;
