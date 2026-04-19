-- =====================================================================
-- Migration: Bulk Pricing Support + process_stock_transfer RPC Fix
-- Run this in your Supabase SQL editor
-- =====================================================================

-- 1. Add bulk pricing columns to products table
ALTER TABLE public.products 
  ADD COLUMN IF NOT EXISTS bulk_quantity integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS bulk_price numeric(12,2) DEFAULT NULL;

-- =====================================================================
-- 2. CREATE the missing process_stock_transfer RPC
-- =====================================================================
CREATE OR REPLACE FUNCTION public.process_stock_transfer(
  p_from_location_id uuid,
  p_to_location_id uuid,
  p_status text,
  p_created_by uuid,
  p_items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transfer_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_transfer_qty integer;
  v_available_qty integer;
  v_business_id uuid;
BEGIN
  -- Resolve business_id from source location
  SELECT business_id INTO v_business_id
  FROM public.locations
  WHERE id = p_from_location_id;

  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'Cannot determine business_id for stock transfer (from_location_id=%)', p_from_location_id;
  END IF;

  -- Create the stock transfer record
  INSERT INTO public.stock_transfers (
    business_id,
    from_location_id,
    to_location_id,
    status,
    created_by
  ) VALUES (
    v_business_id,
    p_from_location_id,
    p_to_location_id,
    p_status::public.transfer_status,
    p_created_by
  ) RETURNING id INTO v_transfer_id;

  -- Insert transfer items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id    := (v_item->>'product_id')::uuid;
    v_transfer_qty  := (v_item->>'transfer_quantity')::integer;
    v_available_qty := COALESCE((v_item->>'available_quantity')::integer, 0);

    INSERT INTO public.stock_transfer_items (
      business_id,
      stock_transfer_id,
      product_id,
      available_quantity,
      transfer_quantity
    ) VALUES (
      v_business_id,
      v_transfer_id,
      v_product_id,
      v_available_qty,
      v_transfer_qty
    );

    -- If status is immediately 'completed', move stock now
    IF p_status = 'completed' THEN
      UPDATE public.product_stocks
      SET quantity = quantity - v_transfer_qty
      WHERE product_id = v_product_id
        AND location_id = p_from_location_id
        AND business_id = v_business_id;

      INSERT INTO public.product_stocks (business_id, product_id, location_id, quantity)
      VALUES (v_business_id, v_product_id, p_to_location_id, v_transfer_qty)
      ON CONFLICT (product_id, location_id)
      DO UPDATE SET quantity = public.product_stocks.quantity + EXCLUDED.quantity;

      UPDATE public.products p
      SET stock_quantity = (
        SELECT COALESCE(SUM(quantity), 0)
        FROM public.product_stocks
        WHERE product_id = p.id
      )
      WHERE id = v_product_id
        AND business_id = v_business_id;

      INSERT INTO public.stock_movements (
        business_id, product_id, user_id, movement_type, quantity,
        location_id, reference_type, reference_id
      ) VALUES (
        v_business_id, v_product_id, p_created_by, 'transfer', -v_transfer_qty,
        p_from_location_id, 'stock_transfer', v_transfer_id
      );

      INSERT INTO public.stock_movements (
        business_id, product_id, user_id, movement_type, quantity,
        destination_location_id, reference_type, reference_id
      ) VALUES (
        v_business_id, v_product_id, p_created_by, 'transfer', v_transfer_qty,
        p_to_location_id, 'stock_transfer', v_transfer_id
      );
    END IF;
  END LOOP;

  RETURN v_transfer_id;
END;
$$;

-- =====================================================================
-- Done. Run this script in Supabase SQL Editor to apply all changes.
-- =====================================================================
