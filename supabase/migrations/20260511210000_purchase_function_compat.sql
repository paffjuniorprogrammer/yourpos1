CREATE OR REPLACE FUNCTION public.create_purchase_transaction(
  p_business_id uuid,
  p_supplier_id uuid,
  p_user_id uuid,
  p_location_id uuid,
  p_total_cost numeric,
  p_payment_status text,
  p_items jsonb,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.create_purchase_transaction(
    p_supplier_id,
    p_user_id,
    p_location_id,
    p_total_cost,
    p_payment_status,
    p_items,
    p_notes
  );
END;
$$;
