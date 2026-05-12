-- Ensure create_sale_transaction has both 14 and 15 argument versions to support different frontend versions and PostgREST caching
-- 15-argument version (with p_business_id)
CREATE OR REPLACE FUNCTION public.create_sale_transaction(
  p_business_id uuid,
  p_sale_number text,
  p_customer_id uuid,
  p_cashier_id uuid,
  p_subtotal numeric,
  p_tax_amount numeric,
  p_total_amount numeric,
  p_payment_method public.payment_method,
  p_payment_status public.payment_status,
  p_notes text,
  p_location_id uuid,
  p_items jsonb,
  p_payments jsonb DEFAULT '[]'::jsonb,
  p_discount_amount numeric DEFAULT 0,
  p_discount_type text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.create_sale_transaction(
    p_sale_number,
    p_customer_id,
    p_cashier_id,
    p_subtotal,
    p_tax_amount,
    p_total_amount,
    p_payment_method,
    p_payment_status,
    p_notes,
    p_location_id,
    p_items,
    p_payments,
    p_discount_amount,
    p_discount_type
  );
END;
$$;

-- 14-argument version (without p_business_id) - explicitly re-declaring to ensure it exists in schema cache
CREATE OR REPLACE FUNCTION public.create_sale_transaction(
  p_sale_number text,
  p_customer_id uuid,
  p_cashier_id uuid,
  p_subtotal numeric,
  p_tax_amount numeric,
  p_total_amount numeric,
  p_payment_method public.payment_method,
  p_payment_status public.payment_status,
  p_notes text,
  p_location_id uuid,
  p_items jsonb,
  p_payments jsonb DEFAULT '[]'::jsonb,
  p_discount_amount numeric DEFAULT 0,
  p_discount_type text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale_id uuid;
  v_item jsonb;
  v_payment jsonb;
  v_product_id uuid;
  v_quantity integer;
  v_line_total numeric;
  v_business_id uuid;
  v_assigned_location_id uuid;
  v_sale_number text;
BEGIN
  -- Determine business_id from cashier
  select business_id into v_business_id from public.users where id = p_cashier_id;
  
  if v_business_id is null then
    raise exception 'Cannot determine business_id for cashier %', p_cashier_id;
  end if;

  -- Use provided location or cashier default
  v_assigned_location_id := coalesce(p_location_id, (select location_id from public.users where id = p_cashier_id));

  -- Generate sale number if not provided
  v_sale_number := coalesce(p_sale_number, 'SALE-' || to_char(now(), 'YYYYMMDD-HH24MISS') || '-' || floor(random()*1000)::text);

  -- 1. Create Sale Header
  insert into public.sales (
    business_id, sale_number, customer_id, cashier_id, location_id,
    subtotal, tax_amount, total_amount, discount_amount, discount_type,
    payment_method, payment_status, notes
  ) values (
    v_business_id, v_sale_number, p_customer_id, p_cashier_id, v_assigned_location_id,
    p_subtotal, p_tax_amount, p_total_amount, p_discount_amount, p_discount_type,
    p_payment_method, p_payment_status, p_notes
  ) returning id into v_sale_id;

  -- 2. Process Sale Items
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;
    v_line_total := (v_item->>'line_total')::numeric;

    insert into public.sale_items (
      business_id, sale_id, product_id, quantity, unit_price, line_total, discount_amount, discount_type
    ) values (
      v_business_id, v_sale_id, v_product_id, v_quantity, (v_item->>'unit_price')::numeric, v_line_total,
      coalesce((v_item->>'discount_amount')::numeric, 0), (v_item->>'discount_type')
    );

    -- Update Stock (Product Total)
    update public.products
    set stock_quantity = stock_quantity - v_quantity
    where id = v_product_id and business_id = v_business_id;

    -- Update Location Stock
    insert into public.product_stocks (business_id, product_id, location_id, quantity)
    values (v_business_id, v_product_id, v_assigned_location_id, -v_quantity)
    on conflict (product_id, location_id)
    do update set quantity = public.product_stocks.quantity - v_quantity;

    -- Record Movement
    insert into public.stock_movements (
      business_id, product_id, user_id, movement_type, quantity, location_id, reference_type, reference_id
    ) values (
      v_business_id, v_product_id, p_cashier_id, 'out', v_quantity, v_assigned_location_id, 'sale', v_sale_id
    );
  end loop;

  -- 3. Record Payment(s)
  for v_payment in select * from jsonb_array_elements(p_payments)
  loop
    insert into public.sale_payments (
      business_id, sale_id, amount, payment_method, notes
    ) values (
      v_business_id, v_sale_id, (v_payment->>'amount')::numeric, (v_payment->>'payment_method')::public.payment_method, (v_payment->>'notes')
    );
  end loop;

  return v_sale_id;
END;
$$;
