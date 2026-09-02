-- The core POS already owns day_closures as the cashier shift/register table.
-- Older databases therefore do not have the hospitality summary aliases used by
-- the Bar POS. Add them safely and use an OPEN cashier register as the single
-- source of truth for whether QR orders may be accepted.

ALTER TABLE public.day_closures
  ADD COLUMN IF NOT EXISTS closure_date date,
  ADD COLUMN IF NOT EXISTS closed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS total_sales numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cash_received numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS momo_received numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS card_received numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS room_revenue numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_expenses numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_profit numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes text;

UPDATE public.day_closures
SET closure_date = COALESCE(closure_date, closing_date, (created_at AT TIME ZONE 'Africa/Kigali')::date)
WHERE closure_date IS NULL;

ALTER TABLE public.day_closures
  ALTER COLUMN closure_date SET DEFAULT ((now() AT TIME ZONE 'Africa/Kigali')::date);

CREATE OR REPLACE FUNCTION public.submit_guest_qr_order(p_kind text, p_token text, p_guest_name text, p_guest_phone text, p_items jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_business_id uuid; v_table_id uuid; v_room_id uuid; v_total numeric := 0; v_item jsonb; v_product record; v_order_id uuid; v_normalized jsonb := '[]'::jsonb;
BEGIN
  IF coalesce(btrim(p_guest_name),'')='' THEN RAISE EXCEPTION 'Please enter your name'; END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items)=0 THEN RAISE EXCEPTION 'Choose at least one item'; END IF;
  IF p_kind='table' THEN SELECT id,business_id INTO v_table_id,v_business_id FROM public.dining_tables WHERE qr_token=p_token AND is_active;
  ELSIF p_kind='room' THEN SELECT id,business_id INTO v_room_id,v_business_id FROM public.rooms WHERE qr_token=p_token;
  ELSE RAISE EXCEPTION 'Invalid QR target'; END IF;
  IF v_business_id IS NULL THEN RAISE EXCEPTION 'This QR code is no longer active'; END IF;

  -- QR customers may only send an order while at least one Bar cashier has
  -- an open register/shift for this business.
  IF NOT EXISTS (
    SELECT 1 FROM public.day_closures
    WHERE business_id = v_business_id AND status = 'open' AND closed_at IS NULL
  ) THEN RAISE EXCEPTION 'The bar is not open right now. Please contact staff.'; END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT id,name,selling_price INTO v_product FROM public.products WHERE id=(v_item->>'product_id')::uuid AND business_id=v_business_id AND is_active AND qr_menu_enabled;
    IF NOT FOUND OR coalesce((v_item->>'quantity')::integer,0)<=0 THEN RAISE EXCEPTION 'One selected item is not available'; END IF;
    v_total := v_total + v_product.selling_price * (v_item->>'quantity')::integer;
    v_normalized := v_normalized || jsonb_build_array(jsonb_build_object('product_id',v_product.id,'name',v_product.name,'quantity',(v_item->>'quantity')::integer,'unit_price',v_product.selling_price,'line_total',v_product.selling_price*(v_item->>'quantity')::integer));
  END LOOP;
  INSERT INTO public.guest_orders(business_id,table_id,room_id,guest_name,guest_phone,items,total)
  VALUES(v_business_id,v_table_id,v_room_id,p_guest_name,nullif(p_guest_phone,''),v_normalized,v_total)
  RETURNING id INTO v_order_id;
  RETURN v_order_id;
END; $$;

GRANT EXECUTE ON FUNCTION public.submit_guest_qr_order(text,text,text,text,jsonb) TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
