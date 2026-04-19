-- Update create_sale_transaction to support discounts
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
  p_payments jsonb default '[]'::jsonb,
  p_discount_amount numeric default 0,
  p_discount_type text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale_id uuid;
  v_item jsonb;
  v_payment jsonb;
  v_product_id uuid;
  v_quantity integer;
  v_unit_price numeric(12,2);
  v_line_total numeric(12,2);
  v_sale_number text := p_sale_number;
  v_assigned_location_id uuid := p_location_id;
  v_business_id uuid;
begin
  -- If location not provided, try to get user default or first available
  if v_assigned_location_id is null then
    select location_id into v_assigned_location_id from public.users where id = p_cashier_id;
  end if;
  
  if v_assigned_location_id is null then
    select id into v_assigned_location_id from public.locations order by created_at asc limit 1;
  end if;

  -- Determine business (tenant) for the sale
  select business_id into v_business_id
  from public.users
  where id = p_cashier_id;

  if v_business_id is null and v_assigned_location_id is not null then
    select business_id into v_business_id
    from public.locations
    where id = v_assigned_location_id;
  end if;

  if v_business_id is null then
    raise exception 'Cannot determine business_id for sale (cashier_id=%)', p_cashier_id;
  end if;

  -- Generate sale number if not provided
  if v_sale_number is null or v_sale_number = '' then
    v_sale_number := public.generate_sale_number();
  end if;

  insert into public.sales (
    business_id, sale_number, customer_id, cashier_id, location_id, 
    subtotal, tax_amount, total_amount, payment_method, payment_status, 
    notes, discount_amount, discount_type
  ) values (
    v_business_id, v_sale_number, p_customer_id, p_cashier_id, v_assigned_location_id, 
    p_subtotal, p_tax_amount, p_total_amount, p_payment_method, p_payment_status, 
    nullif(p_notes, ''), p_discount_amount, p_discount_type
  ) returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item ->> 'product_id')::uuid;
    v_quantity := (v_item ->> 'quantity')::integer;
    v_unit_price := (v_item ->> 'unit_price')::numeric(12,2);
    v_line_total := (v_item ->> 'line_total')::numeric(12,2);

    insert into public.sale_items (
      business_id, sale_id, product_id, quantity, unit_price, line_total,
      discount_amount, discount_type
    )
    values (
      v_business_id, 
      v_sale_id, 
      v_product_id, 
      v_quantity, 
      v_unit_price, 
      v_line_total,
      coalesce((v_item ->> 'discount_amount')::numeric(12,2), 0),
      v_item ->> 'discount_type'
    );

    update public.products
    set stock_quantity = stock_quantity - v_quantity
    where id = v_product_id
      and business_id = v_business_id;

    if v_assigned_location_id is not null then
      insert into public.product_stocks (business_id, product_id, location_id, quantity)
      values (v_business_id, v_product_id, v_assigned_location_id, -v_quantity)
      on conflict (product_id, location_id)
      do update set quantity = public.product_stocks.quantity - v_quantity;
    end if;

    insert into public.stock_movements (
      business_id, product_id, user_id, movement_type, quantity, location_id, reference_type, reference_id
    ) values (
      v_business_id, v_product_id, p_cashier_id, 'out', v_quantity, v_assigned_location_id, 'sale', v_sale_id
    );
  end loop;

  for v_payment in select * from jsonb_array_elements(p_payments)
  loop
    insert into public.sale_payments (business_id, sale_id, payment_method, amount, reference, notes)
    values (
      v_business_id,
      v_sale_id,
      (v_payment ->> 'payment_method')::public.payment_method,
      coalesce((v_payment ->> 'amount')::numeric(12,2), 0),
      nullif(v_payment ->> 'reference', ''),
      nullif(v_payment ->> 'notes', '')
    );
  end loop;

  return v_sale_id;
end;
$$;
