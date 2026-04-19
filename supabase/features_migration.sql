-- =====================================================================
-- FEATURES MIGRATION: Discounts, Returns, Loyalty, Variants, Scheduling
-- Run this ONCE in Supabase SQL Editor
-- =====================================================================

-- ─── 1. DISCOUNTS: Add discount columns to sales & sale_items ────────
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS discount_type  text    DEFAULT NULL
    CHECK (discount_type IN ('percentage','fixed')),
  ADD COLUMN IF NOT EXISTS discount_amount numeric(12,2) DEFAULT 0;

ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS discount_type  text    DEFAULT NULL
    CHECK (discount_type IN ('percentage','fixed')),
  ADD COLUMN IF NOT EXISTS discount_amount numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS original_price  numeric(12,2) DEFAULT NULL;

-- ─── 2. RETURNS / REFUNDS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sale_returns (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id   uuid REFERENCES public.businesses(id) ON DELETE CASCADE,
  sale_id       uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  return_number text,
  created_by    uuid REFERENCES public.users(id),
  reason        text,
  refund_method text NOT NULL DEFAULT 'cash',
  refund_amount numeric(12,2) DEFAULT 0,
  notes         text,
  status        text DEFAULT 'completed',
  created_at    timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sale_return_items (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id     uuid REFERENCES public.businesses(id) ON DELETE CASCADE,
  sale_return_id  uuid REFERENCES public.sale_returns(id) ON DELETE CASCADE,
  sale_item_id    uuid REFERENCES public.sale_items(id) ON DELETE SET NULL,
  product_id      uuid REFERENCES public.products(id) ON DELETE SET NULL,
  quantity        numeric(10,3) NOT NULL,
  unit_price      numeric(12,2) NOT NULL,
  refund_amount   numeric(12,2) NOT NULL,
  restock         boolean DEFAULT true,
  created_at      timestamptz DEFAULT now()
);

-- Auto-generate return number
CREATE OR REPLACE FUNCTION public.generate_return_number()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_count integer;
BEGIN
  SELECT COUNT(*) + 1 INTO v_count
  FROM public.sale_returns
  WHERE business_id = NEW.business_id;
  NEW.return_number := 'RTN-' || LPAD(v_count::text, 5, '0');
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS set_return_number ON public.sale_returns;
CREATE TRIGGER set_return_number
  BEFORE INSERT ON public.sale_returns
  FOR EACH ROW EXECUTE FUNCTION public.generate_return_number();

-- RLS
ALTER TABLE public.sale_returns      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_return_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Business staff manage returns" ON public.sale_returns;
CREATE POLICY "Business staff manage returns" ON public.sale_returns
  FOR ALL USING (business_id = public.get_user_business_id());

DROP POLICY IF EXISTS "Business staff manage return items" ON public.sale_return_items;
CREATE POLICY "Business staff manage return items" ON public.sale_return_items
  FOR ALL USING (business_id = public.get_user_business_id());

-- ─── 3. LOYALTY POINTS ───────────────────────────────────────────────
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS loyalty_points integer DEFAULT 0;

ALTER TABLE public.shop_settings
  ADD COLUMN IF NOT EXISTS loyalty_points_per_100rwf integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS loyalty_redemption_value  integer DEFAULT 1;
  -- 1 point = 1 RWF when redeeming

-- ─── 4. PRODUCT VARIANTS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.product_variants (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id      uuid REFERENCES public.businesses(id) ON DELETE CASCADE,
  product_id       uuid REFERENCES public.products(id) ON DELETE CASCADE,
  variant_label    text NOT NULL,  -- e.g. "Size: Large"
  sku              text,
  additional_price numeric(12,2) DEFAULT 0,
  stock_quantity   integer DEFAULT 0,
  is_active        boolean DEFAULT true,
  created_at       timestamptz DEFAULT now()
);

ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Business staff manage variants" ON public.product_variants;
CREATE POLICY "Business staff manage variants" ON public.product_variants
  FOR ALL USING (business_id = public.get_user_business_id());

-- ─── 5. SUPPLIER PAYMENT SCHEDULES ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.supplier_payment_schedules (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id  uuid REFERENCES public.businesses(id) ON DELETE CASCADE,
  purchase_id  uuid REFERENCES public.purchases(id) ON DELETE CASCADE,
  supplier_id  uuid REFERENCES public.suppliers(id),
  amount_due   numeric(12,2) NOT NULL,
  due_date     date NOT NULL,
  notes        text,
  status       text DEFAULT 'pending'
    CHECK (status IN ('pending','paid','overdue')),
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE public.supplier_payment_schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Business staff manage payment schedules" ON public.supplier_payment_schedules;
CREATE POLICY "Business staff manage payment schedules" ON public.supplier_payment_schedules
  FOR ALL USING (business_id = public.get_user_business_id());

-- ─── 6. PROCESS SALE RETURN RPC ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_sale_return(
  p_sale_id       uuid,
  p_created_by    uuid,
  p_reason        text,
  p_refund_method text,
  p_notes         text,
  p_items         jsonb  -- [{sale_item_id, product_id, quantity, unit_price, restock}]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_return_id   uuid;
  v_item        jsonb;
  v_product_id  uuid;
  v_qty         numeric;
  v_price       numeric;
  v_restock     boolean;
  v_total       numeric := 0;
  v_business_id uuid;
  v_location_id uuid;
  v_customer_id uuid;
  v_points_ratio integer;
  v_points_to_rev integer;
BEGIN
  -- 1. Get business, location, and customer from original sale
  SELECT business_id, location_id, customer_id
  INTO v_business_id, v_location_id, v_customer_id
  FROM public.sales WHERE id = p_sale_id;

  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'Sale not found: %', p_sale_id;
  END IF;

  -- 2. Calculate total refund
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_total := v_total + (v_item->>'unit_price')::numeric * (v_item->>'quantity')::numeric;
  END LOOP;

  -- 3. Create return record
  INSERT INTO public.sale_returns (
    business_id, sale_id, created_by, reason,
    refund_method, refund_amount, notes, status
  ) VALUES (
    v_business_id, p_sale_id, p_created_by, p_reason,
    p_refund_method, v_total, p_notes, 'completed'
  ) RETURNING id INTO v_return_id;

  -- 4. Process each returned item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty        := (v_item->>'quantity')::numeric;
    v_price      := (v_item->>'unit_price')::numeric;
    v_restock    := COALESCE((v_item->>'restock')::boolean, true);

    INSERT INTO public.sale_return_items (
      business_id, sale_return_id, sale_item_id,
      product_id, quantity, unit_price, refund_amount, restock
    ) VALUES (
      v_business_id, v_return_id,
      NULLIF(v_item->>'sale_item_id','')::uuid,
      v_product_id, v_qty, v_price, v_qty * v_price, v_restock
    );

    -- Restock if requested
    IF v_restock THEN
      UPDATE public.products
      SET stock_quantity = stock_quantity + v_qty
      WHERE id = v_product_id AND business_id = v_business_id;

      IF v_location_id IS NOT NULL THEN
        INSERT INTO public.product_stocks (business_id, product_id, location_id, quantity)
        VALUES (v_business_id, v_product_id, v_location_id, v_qty)
        ON CONFLICT (product_id, location_id)
        DO UPDATE SET quantity = public.product_stocks.quantity + v_qty;
      END IF;

      INSERT INTO public.stock_movements (
        business_id, product_id, user_id, movement_type,
        quantity, location_id, reference_type, reference_id
      ) VALUES (
        v_business_id, v_product_id, p_created_by, 'in',
        v_qty, v_location_id, 'sale_return', v_return_id
      );
    END IF;
  END LOOP;

  -- 5. LOYALTY REVERSAL
  IF v_customer_id IS NOT NULL THEN
    SELECT loyalty_points_per_100rwf INTO v_points_ratio
    FROM public.shop_settings WHERE business_id = v_business_id;
    
    IF v_points_ratio > 0 THEN
      v_points_to_rev := floor((v_total / 100.0) * v_points_ratio);
      IF v_points_to_rev > 0 THEN
        UPDATE public.customers
        SET loyalty_points = GREATEST(0, loyalty_points - v_points_to_rev)
        WHERE id = v_customer_id;
      END IF;
    END IF;
  END IF;

  RETURN v_return_id;
END;
$$;

-- ─── Done ─────────────────────────────────────────────────────────────
-- Run this in Supabase SQL Editor to activate all new features.
