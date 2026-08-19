-- Import products into one selected location and record every imported quantity
-- in the same stock movement ledger used by counts, purchases and transfers.
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS notes text;

CREATE OR REPLACE FUNCTION public.import_products_with_stock(
  p_business_id uuid,
  p_location_id uuid,
  p_products jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_product_id uuid;
  v_category_id uuid;
  v_name text;
  v_barcode text;
  v_quantity integer;
  v_imported integer := 0;
  v_user_id uuid;
BEGIN
  IF p_business_id IS NULL OR p_location_id IS NULL THEN
    RAISE EXCEPTION 'A business and destination location are required.';
  END IF;

  IF NOT public.is_platform_admin() AND p_business_id <> public.get_user_business_id() THEN
    RAISE EXCEPTION 'You cannot import products for another business.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.locations
    WHERE id = p_location_id AND business_id = p_business_id AND coalesce(is_active, true)
  ) THEN
    RAISE EXCEPTION 'The selected import location is not active for this business.';
  END IF;

  SELECT id INTO v_user_id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1;

  FOR v_item IN SELECT value FROM jsonb_array_elements(coalesce(p_products, '[]'::jsonb)) LOOP
    v_name := nullif(trim(v_item->>'name'), '');
    IF v_name IS NULL THEN
      RAISE EXCEPTION 'Each imported row must have a product name.';
    END IF;
    v_barcode := nullif(trim(v_item->>'barcode'), '');
    v_quantity := greatest(coalesce(nullif(trim(v_item->>'stock_quantity'), '')::integer, 0), 0);
    v_category_id := NULL;

    IF nullif(trim(v_item->>'category_name'), '') IS NOT NULL THEN
      SELECT id INTO v_category_id FROM public.categories
      WHERE business_id = p_business_id AND lower(name) = lower(trim(v_item->>'category_name'))
      LIMIT 1;
      IF v_category_id IS NULL THEN
        INSERT INTO public.categories (business_id, name)
        VALUES (p_business_id, trim(v_item->>'category_name'))
        RETURNING id INTO v_category_id;
      END IF;
    END IF;

    SELECT id INTO v_product_id FROM public.products
    WHERE business_id = p_business_id
      AND is_active = true
      AND (lower(name) = lower(v_name) OR (v_barcode IS NOT NULL AND barcode = v_barcode))
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_product_id IS NULL THEN
      INSERT INTO public.products (business_id, name, barcode, category_id, cost_price, selling_price, reorder_level, stock_quantity, is_active)
      VALUES (
        p_business_id, v_name, v_barcode, v_category_id,
        coalesce(nullif(trim(v_item->>'cost_price'), '')::numeric, 0),
        coalesce(nullif(trim(v_item->>'selling_price'), '')::numeric, 0),
        coalesce(nullif(trim(v_item->>'reorder_level'), '')::integer, 5), 0, true
      ) RETURNING id INTO v_product_id;
      -- The legacy product trigger creates zero rows at all branches. Imported
      -- products should be available only at the selected receiving branch.
      DELETE FROM public.product_stocks
      WHERE product_id = v_product_id AND location_id <> p_location_id AND quantity = 0;
    ELSE
      UPDATE public.products SET
        category_id = coalesce(v_category_id, category_id),
        barcode = coalesce(v_barcode, barcode),
        cost_price = coalesce(nullif(trim(v_item->>'cost_price'), '')::numeric, cost_price),
        selling_price = coalesce(nullif(trim(v_item->>'selling_price'), '')::numeric, selling_price),
        reorder_level = coalesce(nullif(trim(v_item->>'reorder_level'), '')::integer, reorder_level)
      WHERE id = v_product_id;
    END IF;

    INSERT INTO public.product_stocks (business_id, product_id, location_id, quantity)
    VALUES (p_business_id, v_product_id, p_location_id, v_quantity)
    ON CONFLICT (product_id, location_id)
    DO UPDATE SET quantity = public.product_stocks.quantity + excluded.quantity;

    UPDATE public.products p SET stock_quantity = (
      SELECT coalesce(sum(quantity), 0) FROM public.product_stocks WHERE product_id = p.id
    ) WHERE p.id = v_product_id;

    IF v_quantity > 0 THEN
      INSERT INTO public.stock_movements (
        business_id, product_id, user_id, movement_type, quantity, location_id, reference_type, notes
      ) VALUES (
        p_business_id, v_product_id, v_user_id, 'in', v_quantity, p_location_id, 'import', 'CSV product import'
      );
    END IF;
    v_imported := v_imported + 1;
  END LOOP;
  RETURN v_imported;
END;
$$;

GRANT EXECUTE ON FUNCTION public.import_products_with_stock(uuid, uuid, jsonb) TO authenticated;
