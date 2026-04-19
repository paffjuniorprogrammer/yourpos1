-- =====================================================================
-- PHASE 1 STABILITY MIGRATION
-- Run ONCE in Supabase SQL Editor
-- Safe: only adds indexes and a new archive table. Nothing dropped.
-- =====================================================================

-- ─── 1. CORE INDEXES ─────────────────────────────────────────────────
-- These dramatically speed up all queries that filter by business_id

-- sales
CREATE INDEX IF NOT EXISTS idx_sales_business_id        ON public.sales(business_id);
CREATE INDEX IF NOT EXISTS idx_sales_created_at         ON public.sales(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_customer_id        ON public.sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_cashier_id         ON public.sales(cashier_id);
CREATE INDEX IF NOT EXISTS idx_sales_payment_status     ON public.sales(payment_status);
CREATE INDEX IF NOT EXISTS idx_sales_location_id        ON public.sales(location_id);

-- sale_items
CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id       ON public.sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product_id    ON public.sale_items(product_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_business_id   ON public.sale_items(business_id);

-- products
CREATE INDEX IF NOT EXISTS idx_products_business_id     ON public.products(business_id);
CREATE INDEX IF NOT EXISTS idx_products_category_id     ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_barcode         ON public.products(barcode);


-- purchases
CREATE INDEX IF NOT EXISTS idx_purchases_business_id    ON public.purchases(business_id);
CREATE INDEX IF NOT EXISTS idx_purchases_supplier_id    ON public.purchases(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchases_purchase_date   ON public.purchases(purchase_date DESC);
CREATE INDEX IF NOT EXISTS idx_purchases_payment_status ON public.purchases(payment_status);

-- purchase_items
CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase_id ON public.purchase_items(purchase_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_product_id  ON public.purchase_items(product_id);

-- customers
CREATE INDEX IF NOT EXISTS idx_customers_business_id    ON public.customers(business_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone          ON public.customers(phone) WHERE phone IS NOT NULL;

-- stock_movements (most important — commonly queried by date range)
CREATE INDEX IF NOT EXISTS idx_stock_movements_business_id  ON public.stock_movements(business_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id   ON public.stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at   ON public.stock_movements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_location_id  ON public.stock_movements(location_id);

-- product_stocks
CREATE INDEX IF NOT EXISTS idx_product_stocks_business_id   ON public.product_stocks(business_id);
CREATE INDEX IF NOT EXISTS idx_product_stocks_location_id   ON public.product_stocks(location_id);

-- users
CREATE INDEX IF NOT EXISTS idx_users_business_id        ON public.users(business_id);
CREATE INDEX IF NOT EXISTS idx_users_role               ON public.users(role);

-- day_closures
CREATE INDEX IF NOT EXISTS idx_day_closures_business_id ON public.day_closures(business_id);
CREATE INDEX IF NOT EXISTS idx_day_closures_closing_date ON public.day_closures(closing_date DESC);

-- sale_returns + supplier_payment_schedules
-- These tables are created by features_migration.sql.
-- Wrapped in DO blocks so they fail gracefully if that migration hasn't run yet.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sale_returns') THEN
    CREATE INDEX IF NOT EXISTS idx_sale_returns_business_id ON public.sale_returns(business_id);
    CREATE INDEX IF NOT EXISTS idx_sale_returns_sale_id     ON public.sale_returns(sale_id);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'supplier_payment_schedules') THEN
    CREATE INDEX IF NOT EXISTS idx_supplier_schedules_business_id ON public.supplier_payment_schedules(business_id);
    CREATE INDEX IF NOT EXISTS idx_supplier_schedules_due_date    ON public.supplier_payment_schedules(due_date);
    CREATE INDEX IF NOT EXISTS idx_supplier_schedules_status      ON public.supplier_payment_schedules(status);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'product_variants') THEN
    CREATE INDEX IF NOT EXISTS idx_product_variants_product_id ON public.product_variants(product_id);
  END IF;
END;
$$;


-- ─── 2. STOCK MOVEMENTS ARCHIVE ──────────────────────────────────────
-- Keeps the live table lean (last 6 months only) for fast queries.
-- Older data is preserved in stock_movements_archive.

CREATE TABLE IF NOT EXISTS public.stock_movements_archive (
  LIKE public.stock_movements INCLUDING ALL
);

COMMENT ON TABLE public.stock_movements_archive IS
  'Archive of stock_movements older than 6 months. Moved automatically by archive_old_stock_movements().';

-- Archive function: move rows older than 6 months to archive table
CREATE OR REPLACE FUNCTION public.archive_old_stock_movements()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff    timestamptz := now() - interval '6 months';
  v_count     integer;
BEGIN
  -- Insert old rows into archive
  INSERT INTO public.stock_movements_archive
  SELECT * FROM public.stock_movements
  WHERE created_at < v_cutoff;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Remove them from the live table
  DELETE FROM public.stock_movements
  WHERE created_at < v_cutoff;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.archive_old_stock_movements() IS
  'Call this once a month (or via pg_cron) to keep stock_movements lean. Returns number of rows archived.';

-- ─── 3. OPTIONAL: Enable pg_trgm for fuzzy product name search ───────
-- Uncomment if not already enabled (Supabase has it by default on most plans)
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;


-- ─── 4. VACUUM ANALYZE for fresh query plans ─────────────────────────
-- Run after creating indexes to refresh the planner statistics
-- (Supabase auto-vacuums, but doing it now helps immediately)
ANALYZE public.sales;
ANALYZE public.sale_items;
ANALYZE public.products;
ANALYZE public.purchases;
ANALYZE public.stock_movements;
ANALYZE public.customers;

-- ─── Done ─────────────────────────────────────────────────────────────
-- All indexes added. To archive old stock movements, call:
--   SELECT public.archive_old_stock_movements();
-- Returns count of archived rows.
