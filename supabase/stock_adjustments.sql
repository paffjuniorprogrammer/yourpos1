-- Upgrade stock inventory systems for Wastage and Loss tracking
-- Adds reasons for adjustments and tracks total financial loss value

-- 1. Add columns to track reasons and loss values
ALTER TABLE public.stock_count_items ADD COLUMN IF NOT EXISTS adjustment_reason text DEFAULT 'correction';
ALTER TABLE public.stock_counts ADD COLUMN IF NOT EXISTS total_loss_value numeric DEFAULT 0;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS notes text;

-- 2. Update stock_counts to include count_number if missing (for legacy support)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stock_counts' AND column_name='count_number') THEN
        ALTER TABLE public.stock_counts ADD COLUMN count_number serial;
    END IF;
END $$;

-- 3. Enhance the Stock Counting RPC to handle reasons and calculate loss
CREATE OR REPLACE FUNCTION public.process_stock_count(
  p_location_id uuid,
  p_created_by uuid,
  p_notes text,
  p_items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_counted_qty integer;
  v_adjustment_mode public.adjustment_type;
  v_adjustment_reason text;
  v_system_qty integer;
  v_final_qty integer;
  v_diff integer;
  v_business_id uuid;
  v_cost_price numeric;
  v_total_loss numeric := 0;
BEGIN
  -- Get business_id
  v_business_id := public.get_user_business_id();
  
  -- Create the master record
  INSERT INTO public.stock_counts (
    business_id, stock_name, location_id, created_by, notes
  ) VALUES (
    v_business_id, 'Adj - ' || TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI'), p_location_id, p_created_by, nullif(p_notes, '')
  ) RETURNING id INTO v_count_id;

  -- Process each item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item ->> 'product_id')::uuid;
    v_counted_qty := (v_item ->> 'counted_quantity')::integer;
    v_adjustment_mode := (v_item ->> 'adjustment_mode')::public.adjustment_type;
    v_adjustment_reason := coalesce(v_item ->> 'reason', 'correction');
    
    -- Load current quantity and cost price
    SELECT quantity INTO v_system_qty FROM public.product_stocks WHERE product_id = v_product_id AND location_id = p_location_id;
    v_system_qty := COALESCE(v_system_qty, 0);

    SELECT cost_price INTO v_cost_price FROM public.products WHERE id = v_product_id;
    v_cost_price := COALESCE(v_cost_price, 0);

    -- Calculate final quantity and difference
    IF v_adjustment_mode = 'add' THEN
      v_final_qty := v_system_qty + v_counted_qty;
      v_diff := v_counted_qty;
    ELSE
      v_final_qty := v_system_qty - v_counted_qty;
      v_diff := -v_counted_qty;
      
      -- If subtracting we calculate loss (positive loss value)
      IF v_adjustment_reason != 'correction' THEN
        v_total_loss := v_total_loss + (v_counted_qty * v_cost_price);
      END IF;
    END IF;

    -- Insert item record
    INSERT INTO public.stock_count_items (
      business_id, stock_count_id, product_id, system_quantity, adjustment_mode, adjustment_reason, counted_quantity, final_quantity
    ) VALUES (
      v_business_id, v_count_id, v_product_id, v_system_qty, v_adjustment_mode, v_adjustment_reason, v_counted_qty, v_final_qty
    );

    -- Update location stock
    INSERT INTO public.product_stocks (business_id, product_id, location_id, quantity)
    VALUES (v_business_id, v_product_id, p_location_id, v_final_qty)
    ON CONFLICT (product_id, location_id)
    DO UPDATE SET quantity = EXCLUDED.quantity;

    -- Update global stock total
    UPDATE public.products p
    SET stock_quantity = (
      SELECT COALESCE(SUM(quantity), 0) FROM public.product_stocks WHERE product_id = p.id
    )
    WHERE id = v_product_id
      and business_id = v_business_id;

    -- Record movement
    IF v_diff != 0 THEN
       INSERT INTO public.stock_movements (
        business_id, product_id, user_id, movement_type, quantity, location_id, reference_type, reference_id, notes
      ) VALUES (
        v_business_id, v_product_id, p_created_by, 'count', v_diff, p_location_id, 'stock_count', v_count_id, v_adjustment_reason
      );
    END IF;
  END LOOP;

  -- Update final loss value on master record
  UPDATE public.stock_counts SET total_loss_value = v_total_loss WHERE id = v_count_id;

  RETURN v_count_id;
END;
$$;
