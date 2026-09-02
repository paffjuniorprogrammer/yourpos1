-- Atomic stock write-offs and refund approval workflow.

ALTER TABLE public.stock_count_items
  ADD COLUMN IF NOT EXISTS adjustment_reason text;

ALTER TABLE public.sale_returns
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS stock_applied_at timestamptz;

CREATE OR REPLACE FUNCTION public.record_stock_write_off(
  p_location_id uuid,
  p_business_id uuid,
  p_created_by uuid,
  p_product_id uuid,
  p_quantity integer,
  p_category text,
  p_notes text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count_id uuid;
  v_system_quantity integer;
  v_unit_cost numeric;
BEGIN
  IF NOT public.is_platform_admin() AND (
    public.get_user_business_id() <> p_business_id
    OR NOT public.has_module_permission('Stock Loss', 'add')
  ) THEN
    RAISE EXCEPTION 'You do not have permission to record stock losses';
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Write-off quantity must be greater than zero';
  END IF;
  IF p_category NOT IN ('expired', 'damage', 'expense') THEN
    RAISE EXCEPTION 'Invalid write-off category';
  END IF;

  SELECT COALESCE(cost_price, selling_price, 0)
    INTO v_unit_cost
  FROM public.products
  WHERE id = p_product_id AND business_id = p_business_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product does not belong to the selected business'; END IF;

  SELECT quantity INTO v_system_quantity
  FROM public.product_stocks
  WHERE product_id = p_product_id AND location_id = p_location_id AND business_id = p_business_id
  FOR UPDATE;

  v_system_quantity := COALESCE(v_system_quantity, 0);
  IF p_quantity > v_system_quantity THEN
    RAISE EXCEPTION 'Only % item(s) are available at this location', v_system_quantity;
  END IF;

  INSERT INTO public.stock_counts (
    business_id, stock_name, location_id, created_by, notes, total_loss_value
  ) VALUES (
    p_business_id, 'Write-Off (' || p_category || ')', p_location_id, p_created_by,
    p_notes, p_quantity * v_unit_cost
  ) RETURNING id INTO v_count_id;

  INSERT INTO public.stock_count_items (
    business_id, stock_count_id, product_id, system_quantity, adjustment_mode,
    adjustment_reason, counted_quantity, final_quantity
  ) VALUES (
    p_business_id, v_count_id, p_product_id, v_system_quantity, 'subtract',
    p_category, p_quantity, v_system_quantity - p_quantity
  );

  UPDATE public.product_stocks
  SET quantity = quantity - p_quantity
  WHERE product_id = p_product_id AND location_id = p_location_id AND business_id = p_business_id;

  UPDATE public.products p
  SET stock_quantity = (
    SELECT COALESCE(SUM(ps.quantity), 0)
    FROM public.product_stocks ps
    WHERE ps.product_id = p.id AND ps.business_id = p_business_id
  )
  WHERE p.id = p_product_id AND p.business_id = p_business_id;

  INSERT INTO public.stock_movements (
    business_id, product_id, user_id, movement_type, quantity, location_id,
    reference_type, reference_id, notes
  ) VALUES (
    p_business_id, p_product_id, p_created_by, 'out', -p_quantity, p_location_id,
    'stock_count', v_count_id, 'Write-off (' || p_category || '): ' || COALESCE(p_notes, '')
  );

  RETURN v_count_id;
END;
$$;

-- The app sends p_business_id, which was missing from prior versions of this RPC.
DROP FUNCTION IF EXISTS public.process_sale_return(uuid, uuid, text, text, text, jsonb);
DROP FUNCTION IF EXISTS public.process_sale_return(uuid, uuid, uuid, text, text, jsonb);

CREATE FUNCTION public.process_sale_return(
  p_sale_id uuid,
  p_business_id uuid,
  p_created_by uuid,
  p_reason text,
  p_refund_method text,
  p_notes text,
  p_items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_return_id uuid;
  v_item jsonb;
  v_sale_business_id uuid;
  v_role text;
  v_status text;
  v_total numeric := 0;
BEGIN
  SELECT business_id INTO v_sale_business_id FROM public.sales WHERE id = p_sale_id;
  IF v_sale_business_id IS NULL OR v_sale_business_id <> p_business_id THEN
    RAISE EXCEPTION 'Sale does not belong to the selected business';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'A return reason is required';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Select at least one item to return';
  END IF;

  SELECT role INTO v_role FROM public.users WHERE id = p_created_by AND business_id = p_business_id;
  IF v_role IS NULL THEN RAISE EXCEPTION 'Invalid return requester'; END IF;
  v_status := CASE WHEN v_role IN ('admin', 'super_admin', 'manager') THEN 'completed' ELSE 'pending_approval' END;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    IF COALESCE((v_item->>'quantity')::numeric, 0) <= 0 THEN
      RAISE EXCEPTION 'Return quantities must be greater than zero';
    END IF;
    v_total := v_total + (v_item->>'unit_price')::numeric * (v_item->>'quantity')::numeric;
  END LOOP;

  INSERT INTO public.sale_returns (
    business_id, sale_id, created_by, reason, refund_method, refund_amount, notes, status,
    approved_by, approved_at
  ) VALUES (
    p_business_id, p_sale_id, p_created_by, p_reason, p_refund_method, v_total, p_notes, v_status,
    CASE WHEN v_status = 'completed' THEN p_created_by END,
    CASE WHEN v_status = 'completed' THEN now() END
  ) RETURNING id INTO v_return_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO public.sale_return_items (
      business_id, sale_return_id, sale_item_id, product_id, quantity, unit_price, refund_amount, restock, approved
    ) VALUES (
      p_business_id, v_return_id, NULLIF(v_item->>'sale_item_id', '')::uuid,
      (v_item->>'product_id')::uuid, (v_item->>'quantity')::numeric,
      (v_item->>'unit_price')::numeric, (v_item->>'unit_price')::numeric * (v_item->>'quantity')::numeric,
      COALESCE((v_item->>'restock')::boolean, true), v_status = 'completed'
    );
  END LOOP;

  IF v_status = 'completed' THEN
    PERFORM public.apply_return_restock(v_return_id);
  END IF;
  RETURN v_return_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_return_restock(p_return_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item record;
  v_location_id uuid;
  v_business_id uuid;
  v_user_id uuid;
BEGIN
  SELECT s.location_id, r.business_id, r.approved_by
    INTO v_location_id, v_business_id, v_user_id
  FROM public.sale_returns r
  JOIN public.sales s ON s.id = r.sale_id
  WHERE r.id = p_return_id AND r.status = 'completed' AND r.stock_applied_at IS NULL
  FOR UPDATE OF r;
  IF v_business_id IS NULL THEN RETURN; END IF;

  FOR v_item IN SELECT * FROM public.sale_return_items WHERE sale_return_id = p_return_id AND restock LOOP
    INSERT INTO public.product_stocks (business_id, product_id, location_id, quantity)
    VALUES (v_business_id, v_item.product_id, v_location_id, v_item.quantity)
    ON CONFLICT (product_id, location_id)
    DO UPDATE SET quantity = public.product_stocks.quantity + EXCLUDED.quantity;
    UPDATE public.products p
    SET stock_quantity = (SELECT COALESCE(SUM(quantity), 0) FROM public.product_stocks WHERE product_id = p.id)
    WHERE p.id = v_item.product_id AND p.business_id = v_business_id;
    INSERT INTO public.stock_movements (business_id, product_id, user_id, movement_type, quantity, location_id, reference_type, reference_id)
    VALUES (v_business_id, v_item.product_id, v_user_id, 'in', v_item.quantity, v_location_id, 'sale_return', p_return_id);
  END LOOP;
  UPDATE public.sale_return_items SET approved = true WHERE sale_return_id = p_return_id;
  UPDATE public.sale_returns SET stock_applied_at = now() WHERE id = p_return_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_sale_return(p_return_id uuid, p_approved_by uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_business_id uuid;
BEGIN
  SELECT business_id INTO v_business_id FROM public.sale_returns WHERE id = p_return_id FOR UPDATE;
  IF v_business_id IS NULL THEN RAISE EXCEPTION 'Return request not found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_approved_by AND business_id = v_business_id AND role IN ('admin', 'super_admin', 'manager')) THEN
    RAISE EXCEPTION 'Only an administrator can approve a refund';
  END IF;
  UPDATE public.sale_returns
  SET status = 'completed', approved_by = p_approved_by, approved_at = now()
  WHERE id = p_return_id AND status = 'pending_approval';
  IF NOT FOUND THEN RAISE EXCEPTION 'This return has already been processed'; END IF;
  PERFORM public.apply_return_restock(p_return_id);
END;
$$;

NOTIFY pgrst, 'reload schema';
