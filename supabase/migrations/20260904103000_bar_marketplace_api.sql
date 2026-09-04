CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  key_prefix text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);
DROP TRIGGER IF EXISTS trg_set_business_id_api_keys ON public.api_keys;
CREATE TRIGGER trg_set_business_id_api_keys
  BEFORE INSERT ON public.api_keys
  FOR EACH ROW EXECUTE FUNCTION public.set_business_id_from_context();
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON public.api_keys(key_hash);
DROP POLICY IF EXISTS "Admins can manage api_keys" ON public.api_keys;
CREATE POLICY "Admins can manage api_keys" ON public.api_keys FOR ALL USING (business_id = public.get_user_business_id() AND public.get_user_role() = 'admin') WITH CHECK (business_id = public.get_user_business_id() AND public.get_user_role() = 'admin');

ALTER TABLE public.guest_orders
  ADD COLUMN IF NOT EXISTS order_source text NOT NULL DEFAULT 'qr'
    CHECK (order_source IN ('qr', 'marketplace')),
  ADD COLUMN IF NOT EXISTS external_order_id text;

CREATE UNIQUE INDEX IF NOT EXISTS guest_orders_marketplace_external_key
  ON public.guest_orders(business_id, external_order_id)
  WHERE order_source = 'marketplace' AND external_order_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.marketplace_bar_menu(p_api_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_business_id uuid; v_menu jsonb;
BEGIN
  SELECT business_id INTO v_business_id FROM public.api_keys
    WHERE key_hash = encode(digest(p_api_key, 'sha256'), 'hex') AND is_active
      AND (expires_at IS NULL OR expires_at > now());
  IF v_business_id IS NULL THEN RAISE EXCEPTION 'Invalid or expired API key'; END IF;
  UPDATE public.api_keys SET last_used_at = now()
    WHERE business_id = v_business_id AND key_hash = encode(digest(p_api_key, 'sha256'), 'hex');
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'price',p.selling_price,'category',COALESCE(c.name,'General'),'image_url',p.image_url) ORDER BY p.name), '[]'::jsonb)
    INTO v_menu FROM public.products p LEFT JOIN public.categories c ON c.id=p.category_id
    WHERE p.business_id=v_business_id AND p.is_active;
  RETURN jsonb_build_object('business_id',v_business_id,'products',v_menu);
END; $$;

CREATE OR REPLACE FUNCTION public.submit_marketplace_bar_order(
  p_api_key text, p_external_order_id text, p_customer_name text,
  p_customer_phone text, p_items jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_business_id uuid; v_order_id uuid; v_item jsonb; v_product record; v_total numeric := 0; v_normalized jsonb := '[]'::jsonb;
BEGIN
  SELECT business_id INTO v_business_id FROM public.api_keys WHERE key_hash=encode(digest(p_api_key,'sha256'),'hex') AND is_active AND (expires_at IS NULL OR expires_at > now());
  IF v_business_id IS NULL THEN RAISE EXCEPTION 'Invalid or expired API key'; END IF;
  IF coalesce(btrim(p_customer_name),'')='' OR coalesce(btrim(p_customer_phone),'')='' THEN RAISE EXCEPTION 'Customer name and phone are required'; END IF;
  IF coalesce(btrim(p_external_order_id),'')='' OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items)=0 THEN RAISE EXCEPTION 'Order id and items are required'; END IF;
  SELECT id INTO v_order_id FROM public.guest_orders WHERE business_id=v_business_id AND order_source='marketplace' AND external_order_id=p_external_order_id;
  IF v_order_id IS NOT NULL THEN RETURN v_order_id; END IF;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT id,name,selling_price INTO v_product FROM public.products WHERE id=(v_item->>'product_id')::uuid AND business_id=v_business_id AND is_active;
    IF NOT FOUND OR coalesce((v_item->>'quantity')::integer,0)<=0 THEN RAISE EXCEPTION 'One selected item is not available'; END IF;
    v_total := v_total + v_product.selling_price * (v_item->>'quantity')::integer;
    v_normalized := v_normalized || jsonb_build_array(jsonb_build_object('product_id',v_product.id,'name',v_product.name,'quantity',(v_item->>'quantity')::integer,'unit_price',v_product.selling_price,'line_total',v_product.selling_price*(v_item->>'quantity')::integer));
  END LOOP;
  INSERT INTO public.guest_orders(business_id,guest_name,guest_phone,items,total,order_source,external_order_id)
    VALUES(v_business_id,p_customer_name,p_customer_phone,v_normalized,v_total,'marketplace',p_external_order_id) RETURNING id INTO v_order_id;
  UPDATE public.api_keys SET last_used_at=now() WHERE business_id=v_business_id AND key_hash=encode(digest(p_api_key,'sha256'),'hex');
  RETURN v_order_id;
END; $$;

GRANT EXECUTE ON FUNCTION public.marketplace_bar_menu(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_marketplace_bar_order(text,text,text,text,jsonb) TO anon, authenticated;

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
      VALUES(v_order.business_id,v_order.table_id,v_booking_id,CASE WHEN v_order.order_source='marketplace' THEN 'Online order - ' || v_order.guest_name WHEN v_order.room_id IS NOT NULL THEN 'Room order - ' || v_order.guest_name ELSE 'Table order - ' || v_order.guest_name END,v_order.items,v_order.total,0,0,v_order.total,'open',p_reviewer) RETURNING id INTO v_tab_id;
    IF v_order.table_id IS NOT NULL THEN UPDATE public.dining_tables SET status='occupied',active_order_id=v_tab_id WHERE id=v_order.table_id; END IF;
  END IF;
END; $$;

GRANT EXECUTE ON FUNCTION public.review_guest_qr_order(uuid,uuid,boolean,text) TO authenticated;
NOTIFY pgrst, 'reload schema';
