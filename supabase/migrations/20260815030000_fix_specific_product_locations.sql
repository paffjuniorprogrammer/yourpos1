-- Product availability is represented by product_stocks rows. The old
-- automatic triggers created rows for every branch and made every product look
-- available everywhere, so remove those defaults and save the selected rows
-- through one checked server-side operation.
DROP TRIGGER IF EXISTS tr_initialize_product_stocks ON public.products;
DROP TRIGGER IF EXISTS tr_initialize_location_stocks ON public.locations;

CREATE OR REPLACE FUNCTION public.set_product_locations(
  p_product_id uuid,
  p_location_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_business_id uuid;
  v_invalid_location_count integer;
BEGIN
  SELECT business_id INTO v_business_id FROM public.products WHERE id = p_product_id;
  IF v_business_id IS NULL THEN RAISE EXCEPTION 'Product not found.'; END IF;

  IF NOT public.is_platform_admin() AND (
    v_business_id <> public.get_user_business_id()
    OR NOT public.has_module_permission('Products', 'edit')
  ) THEN
    RAISE EXCEPTION 'You do not have permission to change product locations.';
  END IF;

  p_location_ids := ARRAY(SELECT DISTINCT unnest(coalesce(p_location_ids, ARRAY[]::uuid[])));
  IF cardinality(p_location_ids) = 0 THEN RAISE EXCEPTION 'Select at least one location.'; END IF;

  SELECT count(*) INTO v_invalid_location_count
  FROM unnest(p_location_ids) AS selected_location(id)
  LEFT JOIN public.locations location ON location.id = selected_location.id
  WHERE location.id IS NULL OR location.business_id <> v_business_id OR coalesce(location.is_active, true) = false;
  IF v_invalid_location_count > 0 THEN RAISE EXCEPTION 'One or more selected locations are invalid.'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.product_stocks
    WHERE product_id = p_product_id
      AND location_id <> ALL(p_location_ids)
      AND quantity <> 0
  ) THEN
    RAISE EXCEPTION 'This product has stock at a removed location. Transfer or count that stock before removing the location.';
  END IF;

  DELETE FROM public.product_stocks
  WHERE product_id = p_product_id
    AND location_id <> ALL(p_location_ids)
    AND quantity = 0;

  INSERT INTO public.product_stocks (business_id, product_id, location_id, quantity)
  SELECT v_business_id, p_product_id, selected_location.id, 0
  FROM unnest(p_location_ids) AS selected_location(id)
  ON CONFLICT (product_id, location_id) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_product_locations(uuid, uuid[]) TO authenticated;
