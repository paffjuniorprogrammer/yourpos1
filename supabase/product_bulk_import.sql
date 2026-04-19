-- Migration script to add default_profit_percentage and bulk_import_products RPC

-- 1. Add Default Profit Percentage to Businesses Table
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS default_profit_percentage numeric(5,2) not null default 30;

-- 2. Create Bulk Import Function (with bulk pricing support)
CREATE OR REPLACE FUNCTION public.bulk_import_products(
  p_business_id uuid,
  p_location_id uuid, -- Can be null if the CSV dictates no immediate stock allocations
  p_products_json jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prod jsonb;
  v_product_id uuid;
  v_initial_stock numeric;
  v_cost_price numeric;
BEGIN
  -- Loop through products array
  FOR v_prod IN SELECT * FROM jsonb_array_elements(p_products_json)
  LOOP
    v_initial_stock := COALESCE((nullif(trim(v_prod->>'initial_stock'), ''))::numeric, 0);
    v_cost_price := COALESCE((nullif(trim(v_prod->>'cost_price'), ''))::numeric, 0);

    -- 1. Insert product (with optional bulk pricing columns)
    INSERT INTO public.products (
      business_id,
      name,
      barcode,
      category_id,
      measurement,
      cost_price,
      selling_price,
      reorder_level,
      image_url,
      bulk_quantity,
      bulk_price,
      is_active
    ) VALUES (
      p_business_id,
      v_prod->>'name',
      nullif(trim(v_prod->>'barcode'), ''),
      nullif(trim(v_prod->>'category_id'), '')::uuid,
      COALESCE(nullif(trim(v_prod->>'measurement'), ''), 'piece'),
      v_cost_price,
      (nullif(trim(v_prod->>'selling_price'), ''))::numeric,
      COALESCE((nullif(trim(v_prod->>'reorder_level'), ''))::numeric, 5),
      nullif(trim(v_prod->>'image_url'), ''),
      (nullif(trim(v_prod->>'bulk_quantity'), ''))::integer,
      (nullif(trim(v_prod->>'bulk_price'), ''))::numeric,
      true
    ) RETURNING id INTO v_product_id;

    -- 2. If initial stock > 0, bind it to a warehouse and record standard movement tracks
    IF v_initial_stock > 0 AND p_location_id IS NOT NULL THEN
      -- Insert stock level record
      INSERT INTO public.product_stocks (
        business_id,
        location_id,
        product_id,
        quantity,
        last_counted_at
      ) VALUES (
        p_business_id,
        p_location_id,
        v_product_id,
        v_initial_stock,
        now()
      );

      -- Log movement
      INSERT INTO public.stock_movements (
        business_id,
        location_id,
        product_id,
        type,
        quantity,
        reference_id,
        notes,
        created_by
      ) VALUES (
        p_business_id,
        p_location_id,
        v_product_id,
        'in',
        v_initial_stock,
        null,
        'Bulk CSV Import Initial Stock',
        auth.uid()
      );

      -- Log Audit
      INSERT INTO public.audit_logs (
        business_id,
        user_id,
        action,
        details,
        module
      ) VALUES (
        p_business_id,
        auth.uid(),
        'Bulk Import Initial Stock',
        jsonb_build_object('product_id', v_product_id, 'quantity', v_initial_stock, 'location_id', p_location_id),
        'inventory'
      );
    END IF;
  END LOOP;
END;
$$;
