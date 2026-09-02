-- Keep RPC signatures in sync with the named parameters used by the web client.
-- PostgREST resolves RPCs by parameter names, so overloaded versions of these
-- functions can make otherwise valid calls disappear from its schema cache.

-- Remove legacy variants before defining the single public contract for each RPC.
DROP FUNCTION IF EXISTS public.process_stock_transfer(uuid, uuid, text, uuid, jsonb);
DROP FUNCTION IF EXISTS public.process_stock_transfer(uuid, uuid, uuid, text, uuid, jsonb);

CREATE FUNCTION public.process_stock_transfer(
  p_from_location_id uuid,
  p_to_location_id uuid,
  p_business_id uuid,
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
  v_location_business_id uuid;
  v_transfer_quantity integer;
  v_available_quantity integer;
BEGIN
  IF NOT public.is_platform_admin() AND (
    public.get_user_business_id() <> p_business_id
    OR NOT public.has_module_permission('Transfers', 'add')
  ) THEN
    RAISE EXCEPTION 'You do not have permission to create stock transfers';
  END IF;

  IF p_from_location_id = p_to_location_id THEN
    RAISE EXCEPTION 'Source and destination locations must be different';
  END IF;

  SELECT business_id
  INTO v_location_business_id
  FROM public.locations
  WHERE id = p_from_location_id;

  IF v_location_business_id IS NULL OR v_location_business_id <> p_business_id THEN
    RAISE EXCEPTION 'Source location does not belong to the selected business';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.locations
    WHERE id = p_to_location_id AND business_id = p_business_id
  ) THEN
    RAISE EXCEPTION 'Destination location does not belong to the selected business';
  END IF;

  IF p_status NOT IN ('pending', 'in_transit', 'completed') THEN
    RAISE EXCEPTION 'Invalid transfer status: %', p_status;
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'A transfer must contain at least one item';
  END IF;

  INSERT INTO public.stock_transfers (
    business_id, from_location_id, to_location_id, status, created_by
  ) VALUES (
    p_business_id, p_from_location_id, p_to_location_id,
    p_status::public.transfer_status, p_created_by
  ) RETURNING id INTO v_transfer_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_transfer_quantity := (v_item->>'transfer_quantity')::integer;
    v_available_quantity := COALESCE((v_item->>'available_quantity')::integer, 0);

    IF (v_item->>'product_id') IS NULL OR v_transfer_quantity IS NULL OR v_transfer_quantity <= 0 THEN
      RAISE EXCEPTION 'Each transfer item requires a product_id and positive transfer_quantity';
    END IF;

    INSERT INTO public.stock_transfer_items (
      business_id, stock_transfer_id, product_id, available_quantity, transfer_quantity
    ) VALUES (
      p_business_id, v_transfer_id, (v_item->>'product_id')::uuid,
      v_available_quantity, v_transfer_quantity
    );
  END LOOP;

  RETURN v_transfer_id;
END;
$$;

DROP FUNCTION IF EXISTS public.create_purchase_requisition(uuid, uuid, text, uuid, jsonb);
DROP FUNCTION IF EXISTS public.create_purchase_requisition(uuid, uuid, text, uuid, jsonb, text);
DROP FUNCTION IF EXISTS public.create_purchase_requisition(uuid, jsonb, uuid, text);

CREATE FUNCTION public.create_purchase_requisition(
  p_location_id uuid,
  p_supplier_id uuid,
  p_notes text,
  p_created_by uuid,
  p_items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requisition_id uuid;
  v_business_id uuid;
  v_item jsonb;
BEGIN
  SELECT business_id INTO v_business_id
  FROM public.users
  WHERE id = p_created_by;

  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'Could not determine the business for the creating user';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.locations
    WHERE id = p_location_id AND business_id = v_business_id
  ) THEN
    RAISE EXCEPTION 'Location does not belong to the creating user business';
  END IF;

  IF p_supplier_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.suppliers
    WHERE id = p_supplier_id AND business_id = v_business_id
  ) THEN
    RAISE EXCEPTION 'Supplier does not belong to the creating user business';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'A purchase requisition must contain at least one item';
  END IF;

  INSERT INTO public.purchase_requisitions (
    location_id, supplier_id, notes, created_by, business_id
  ) VALUES (
    p_location_id, p_supplier_id, p_notes, p_created_by, v_business_id
  ) RETURNING id INTO v_requisition_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    IF (v_item->>'product_id') IS NULL OR (v_item->>'quantity') IS NULL
       OR (v_item->>'quantity')::numeric <= 0 THEN
      RAISE EXCEPTION 'Each requisition item requires a product_id and positive quantity';
    END IF;

    INSERT INTO public.purchase_requisition_items (
      requisition_id, product_id, quantity, unit_cost, notes
    ) VALUES (
      v_requisition_id,
      (v_item->>'product_id')::uuid,
      (v_item->>'quantity')::numeric,
      COALESCE((v_item->>'unit_cost')::numeric, (v_item->>'unit_price')::numeric, 0),
      v_item->>'notes'
    );
  END LOOP;

  RETURN v_requisition_id;
END;
$$;

-- Make PostgREST pick up the new signatures immediately.
NOTIFY pgrst, 'reload schema';
