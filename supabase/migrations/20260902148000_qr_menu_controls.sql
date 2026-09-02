-- Staff with Tables access can control exactly which active products are shown
-- to QR customers. Prices always come from the product catalogue.

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS qr_menu_enabled boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.set_qr_menu_product_enabled(p_product_id uuid, p_enabled boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_business_id uuid;
BEGIN
  SELECT business_id INTO v_business_id FROM public.products WHERE id=p_product_id FOR UPDATE;
  IF v_business_id IS NULL THEN RAISE EXCEPTION 'Product not found'; END IF;
  IF v_business_id <> public.get_user_business_id() OR NOT (public.has_module_permission('Tables','edit') OR public.get_user_role()='admin') THEN
    RAISE EXCEPTION 'You are not allowed to control the QR menu';
  END IF;
  UPDATE public.products SET qr_menu_enabled=p_enabled WHERE id=p_product_id;
END; $$;

CREATE OR REPLACE FUNCTION public.get_qr_menu_products(p_business_id uuid)
RETURNS TABLE(id uuid, name text, category text, price numeric, enabled boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_business_id <> public.get_user_business_id() OR NOT (public.has_module_permission('Tables','view') OR public.get_user_role()='admin') THEN RAISE EXCEPTION 'Not authorised'; END IF;
  RETURN QUERY SELECT p.id,p.name,COALESCE(c.name,'General'),p.selling_price,p.qr_menu_enabled FROM public.products p LEFT JOIN public.categories c ON c.id=p.category_id WHERE p.business_id=p_business_id AND p.is_active ORDER BY c.name,p.name;
END; $$;

CREATE OR REPLACE FUNCTION public.get_guest_qr_menu(p_kind text, p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_business_id uuid; v_target jsonb; v_menu jsonb;
BEGIN
  IF p_kind = 'table' THEN SELECT t.business_id,jsonb_build_object('kind','table','label','Table ' || t.table_number) INTO v_business_id,v_target FROM public.dining_tables t WHERE t.qr_token=p_token AND t.is_active;
  ELSIF p_kind = 'room' THEN SELECT r.business_id,jsonb_build_object('kind','room','label','Room ' || r.room_number) INTO v_business_id,v_target FROM public.rooms r WHERE r.qr_token=p_token;
  ELSE RAISE EXCEPTION 'Invalid QR target'; END IF;
  IF v_business_id IS NULL THEN RAISE EXCEPTION 'This QR code is no longer active'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'price',p.selling_price,'category',COALESCE(c.name,'General'),'image_url',p.image_url,'in_stock',COALESCE(p.stock_quantity,0)) ORDER BY p.name),'[]'::jsonb) INTO v_menu FROM public.products p LEFT JOIN public.categories c ON c.id=p.category_id WHERE p.business_id=v_business_id AND p.is_active AND p.qr_menu_enabled;
  RETURN jsonb_build_object('business_id',v_business_id,'business_name',COALESCE((SELECT shop_name FROM public.shop_settings WHERE business_id=v_business_id LIMIT 1),(SELECT name FROM public.businesses WHERE id=v_business_id)),'target',v_target,'products',v_menu);
END; $$;

GRANT EXECUTE ON FUNCTION public.set_qr_menu_product_enabled(uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_qr_menu_products(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_guest_qr_menu(text,text) TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
