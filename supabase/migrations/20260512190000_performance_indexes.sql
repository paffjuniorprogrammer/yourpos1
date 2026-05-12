-- Optimization indexes for POS and Product listing
CREATE INDEX IF NOT EXISTS idx_products_business_id ON public.products(business_id);
CREATE INDEX IF NOT EXISTS idx_products_is_active ON public.products(is_active);

CREATE INDEX IF NOT EXISTS idx_product_stocks_business_id ON public.product_stocks(business_id);
CREATE INDEX IF NOT EXISTS idx_product_stocks_product_id ON public.product_stocks(product_id);
CREATE INDEX IF NOT EXISTS idx_product_stocks_location_id ON public.product_stocks(location_id);
CREATE INDEX IF NOT EXISTS idx_product_stocks_composite ON public.product_stocks(product_id, location_id);

-- Ensure categories also have business_id index for filtering
CREATE INDEX IF NOT EXISTS idx_categories_business_id ON public.categories(business_id);

-- Analytics optimization
CREATE INDEX IF NOT EXISTS idx_sales_business_id ON public.sales(business_id);
CREATE INDEX IF NOT EXISTS idx_purchases_business_id ON public.purchases(business_id);
