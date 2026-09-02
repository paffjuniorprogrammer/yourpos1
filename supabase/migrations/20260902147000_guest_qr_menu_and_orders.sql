-- Customer QR menu and order inbox. Public visitors only use SECURITY DEFINER
-- functions with an unguessable QR token; they do not receive table access.

CREATE TABLE IF NOT EXISTS public.guest_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  table_id uuid REFERENCES public.dining_tables(id) ON DELETE SET NULL,
  room_id uuid REFERENCES public.rooms(id) ON DELETE SET NULL,
  guest_name text NOT NULL,
  guest_phone text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  total numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  reviewed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS guest_orders_business_status_idx ON public.guest_orders(business_id, status, created_at DESC);
ALTER TABLE public.guest_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Bar staff manage business guest orders" ON public.guest_orders FOR SELECT
USING (business_id = public.get_user_business_id() AND (public.has_module_permission('Bar POS', 'view') OR public.get_user_role() = 'admin'));

CREATE OR REPLACE FUNCTION public.get_guest_qr_menu(p_kind text, p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_business_id uuid; v_target jsonb; v_menu jsonb;
BEGIN
  IF p_kind = 'table' THEN
    SELECT t.business_id, jsonb_build_object('kind','table','label','Table ' || t.table_number)
      INTO v_business_id, v_target FROM public.dining_tables t WHERE t.qr_token = p_token AND t.is_active;
  ELSIF p_kind = 'room' THEN
    SELECT r.business_id, jsonb_build_object('kind','room','label','Room ' || r.room_number)
      INTO v_business_id, v_target FROM public.rooms r WHERE r.qr_token = p_token;
  ELSE RAISE EXCEPTION 'Invalid QR target'; END IF;
  IF v_business_id IS NULL THEN RAISE EXCEPTION 'This QR code is no longer active'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'price',p.selling_price,'category',COALESCE(c.name,'General'),'image_url',p.image_url,'in_stock',COALESCE(p.stock_quantity,0)) ORDER BY p.name), '[]'::jsonb)
    INTO v_menu FROM public.products p LEFT JOIN public.categories c ON c.id=p.category_id
    WHERE p.business_id=v_business_id AND p.is_active;
  RETURN jsonb_build_object('business_id',v_business_id,'business_name',COALESCE((SELECT shop_name FROM public.shop_settings WHERE business_id=v_business_id LIMIT 1),(SELECT name FROM public.businesses WHERE id=v_business_id)), 'target',v_target,'products',v_menu);
END; $$;

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
  IF EXISTS (SELECT 1 FROM public.day_closures WHERE business_id=v_business_id AND closure_date=(now() AT TIME ZONE 'Africa/Kigali')::date) THEN RAISE EXCEPTION 'The bar is closed for today. Please contact staff.'; END IF;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT id,name,selling_price INTO v_product FROM public.products WHERE id=(v_item->>'product_id')::uuid AND business_id=v_business_id AND is_active;
    IF NOT FOUND OR coalesce((v_item->>'quantity')::integer,0)<=0 THEN RAISE EXCEPTION 'One selected item is not available'; END IF;
    v_total := v_total + v_product.selling_price * (v_item->>'quantity')::integer;
    v_normalized := v_normalized || jsonb_build_array(jsonb_build_object('product_id',v_product.id,'name',v_product.name,'quantity',(v_item->>'quantity')::integer,'unit_price',v_product.selling_price,'line_total',v_product.selling_price*(v_item->>'quantity')::integer));
  END LOOP;
  INSERT INTO public.guest_orders(business_id,table_id,room_id,guest_name,guest_phone,items,total) VALUES(v_business_id,v_table_id,v_room_id,p_guest_name,nullif(p_guest_phone,''),v_normalized,v_total) RETURNING id INTO v_order_id;
  RETURN v_order_id;
END; $$;

CREATE OR REPLACE FUNCTION public.review_guest_qr_order(p_order_id uuid, p_reviewer uuid, p_accept boolean, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_order public.guest_orders; v_tab_id uuid; v_booking_id uuid;
BEGIN
  SELECT * INTO v_order FROM public.guest_orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Customer order not found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id=p_reviewer AND business_id=v_order.business_id AND (role='admin' OR public.has_module_permission('Bar POS','add'))) THEN RAISE EXCEPTION 'You are not allowed to review orders'; END IF;
  IF v_order.status <> 'pending' THEN RAISE EXCEPTION 'This order has already been reviewed'; END IF;
  UPDATE public.guest_orders SET status=CASE WHEN p_accept THEN 'accepted' ELSE 'rejected' END, reviewed_by=p_reviewer, reviewed_at=now(), rejection_reason=CASE WHEN p_accept THEN NULL ELSE nullif(p_reason,'') END WHERE id=p_order_id;
  IF p_accept THEN
    IF v_order.room_id IS NOT NULL THEN SELECT id INTO v_booking_id FROM public.room_bookings WHERE room_id=v_order.room_id AND status IN ('checked_in','reserved') ORDER BY check_in DESC LIMIT 1; END IF;
    INSERT INTO public.active_tabs(business_id,table_id,booking_id,tab_name,cart_items,subtotal,tax,discount,total,status,created_by)
    VALUES(v_order.business_id,v_order.table_id,v_booking_id,CASE WHEN v_order.room_id IS NOT NULL THEN 'Room order - ' || v_order.guest_name ELSE 'Table order - ' || v_order.guest_name END,v_order.items,v_order.total,0,0,v_order.total,'open',p_reviewer) RETURNING id INTO v_tab_id;
    IF v_order.table_id IS NOT NULL THEN UPDATE public.dining_tables SET status='occupied',active_order_id=v_tab_id WHERE id=v_order.table_id; END IF;
  END IF;
END; $$;

GRANT EXECUTE ON FUNCTION public.get_guest_qr_menu(text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_guest_qr_order(text,text,text,text,jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_guest_qr_order(uuid,uuid,boolean,text) TO authenticated;
NOTIFY pgrst, 'reload schema';
