-- Migration: Fix create_purchase_requisition RPC function parameters and overloading for schema cache resolution

CREATE OR REPLACE FUNCTION public.create_purchase_requisition(
    p_location_id UUID,
    p_supplier_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_created_by UUID DEFAULT NULL,
    p_items JSONB DEFAULT '[]'::jsonb
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_requisition_id UUID;
    v_business_id UUID;
    v_item JSONB;
BEGIN
    -- Get business_id from user if created_by is provided, else fallback to session context
    IF p_created_by IS NOT NULL THEN
      SELECT business_id INTO v_business_id FROM public.users WHERE id = p_created_by;
    END IF;
    
    IF v_business_id IS NULL THEN
      v_business_id := public.get_user_business_id();
    END IF;

    -- Create requisition
    INSERT INTO public.purchase_requisitions (
        location_id,
        supplier_id,
        notes,
        created_by,
        business_id
    ) VALUES (
        p_location_id,
        p_supplier_id,
        p_notes,
        p_created_by,
        v_business_id
    ) RETURNING id INTO v_requisition_id;
    
    -- Create items
    IF p_items IS NOT NULL AND jsonb_array_length(p_items) > 0 THEN
      FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
      LOOP
          INSERT INTO public.purchase_requisition_items (
              requisition_id,
              product_id,
              quantity,
              unit_cost,
              notes
          ) VALUES (
              v_requisition_id,
              (v_item->>'product_id')::UUID,
              (v_item->>'quantity')::NUMERIC,
              COALESCE((v_item->>'unit_cost')::NUMERIC, (v_item->>'unit_price')::NUMERIC, 0),
              v_item->>'notes'
          );
      END LOOP;
    END IF;
    
    RETURN v_requisition_id;
END;
$$;

-- Provide overload matching alternative parameter ordering (p_created_by, p_items, p_location_id, p_notes)
CREATE OR REPLACE FUNCTION public.create_purchase_requisition(
    p_created_by UUID,
    p_items JSONB,
    p_location_id UUID,
    p_notes TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN public.create_purchase_requisition(
        p_location_id => p_location_id,
        p_supplier_id => NULL,
        p_notes => p_notes,
        p_created_by => p_created_by,
        p_items => p_items
    );
END;
$$;
