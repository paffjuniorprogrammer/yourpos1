-- Fix purchase stock accounting and hidden purchase item rows.
-- Older rows can have null business_id, which makes RLS hide purchase lines
-- while the purchase header still appears.

UPDATE public.purchases p
SET business_id = COALESCE(
  (SELECT l.business_id FROM public.locations l WHERE l.id = p.location_id),
  (SELECT u.business_id FROM public.users u WHERE u.id = p.user_id),
  (SELECT s.business_id FROM public.suppliers s WHERE s.id = p.supplier_id)
)
WHERE p.business_id IS NULL
  AND COALESCE(
    (SELECT l.business_id FROM public.locations l WHERE l.id = p.location_id),
    (SELECT u.business_id FROM public.users u WHERE u.id = p.user_id),
    (SELECT s.business_id FROM public.suppliers s WHERE s.id = p.supplier_id)
  ) IS NOT NULL;

UPDATE public.purchase_items pi
SET business_id = p.business_id
FROM public.purchases p
WHERE pi.purchase_id = p.id
  AND (pi.business_id IS NULL OR pi.business_id <> p.business_id);

UPDATE public.purchase_payments pp
SET business_id = p.business_id
FROM public.purchases p
WHERE pp.purchase_id = p.id
  AND (pp.business_id IS NULL OR pp.business_id <> p.business_id);

UPDATE public.product_stocks ps
SET business_id = COALESCE(p.business_id, l.business_id)
FROM public.products p, public.locations l
WHERE ps.product_id = p.id
  AND ps.location_id = l.id
  AND (ps.business_id IS NULL OR ps.business_id <> COALESCE(p.business_id, l.business_id));

CREATE OR REPLACE FUNCTION public.create_purchase_transaction(
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
DECLARE
  v_purchase_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_quantity integer;
  v_cost_price numeric;
  v_selling_price numeric;
  v_business_id uuid;
BEGIN
  SELECT business_id INTO v_business_id
  FROM public.locations
  WHERE id = p_location_id;

  IF v_business_id IS NULL THEN
    SELECT business_id INTO v_business_id
    FROM public.users
    WHERE id = p_user_id;
  END IF;

  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'Cannot determine business_id for purchase';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.suppliers
    WHERE id = p_supplier_id
      AND business_id = v_business_id
  ) THEN
    RAISE EXCEPTION 'Supplier does not belong to this business';
  END IF;

  INSERT INTO public.purchases (
    business_id,
    supplier_id,
    user_id,
    location_id,
    total_cost,
    payment_status,
    notes
  )
  VALUES (
    v_business_id,
    p_supplier_id,
    p_user_id,
    p_location_id,
    p_total_cost,
    p_payment_status::public.payment_status,
    NULLIF(p_notes, '')
  )
  RETURNING id INTO v_purchase_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item ->> 'product_id')::uuid;
    v_quantity := (v_item ->> 'quantity')::integer;
    v_cost_price := (v_item ->> 'cost_price')::numeric;
    v_selling_price := NULLIF(v_item ->> 'selling_price', '')::numeric;

    IF v_quantity IS NULL OR v_quantity <= 0 THEN
      RAISE EXCEPTION 'Purchase quantity must be greater than zero';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.products
      WHERE id = v_product_id
        AND business_id = v_business_id
        AND is_active = true
    ) THEN
      RAISE EXCEPTION 'Product % does not belong to this business', v_product_id;
    END IF;

    INSERT INTO public.purchase_items (
      business_id,
      purchase_id,
      product_id,
      quantity,
      cost_price,
      line_total
    )
    VALUES (
      v_business_id,
      v_purchase_id,
      v_product_id,
      v_quantity,
      v_cost_price,
      v_quantity * v_cost_price
    );

    INSERT INTO public.product_stocks (
      business_id,
      product_id,
      location_id,
      quantity
    )
    VALUES (
      v_business_id,
      v_product_id,
      p_location_id,
      v_quantity
    )
    ON CONFLICT (product_id, location_id)
    DO UPDATE SET
      quantity = public.product_stocks.quantity + EXCLUDED.quantity,
      business_id = EXCLUDED.business_id;

    UPDATE public.products
    SET
      stock_quantity = (
        SELECT COALESCE(SUM(quantity), 0)
        FROM public.product_stocks
        WHERE product_id = v_product_id
          AND business_id = v_business_id
      ),
      cost_price = v_cost_price,
      selling_price = COALESCE(NULLIF(v_selling_price, 0), selling_price)
    WHERE id = v_product_id
      AND business_id = v_business_id;

    INSERT INTO public.stock_movements (
      business_id,
      product_id,
      user_id,
      movement_type,
      quantity,
      location_id,
      reference_type,
      reference_id
    )
    VALUES (
      v_business_id,
      v_product_id,
      p_user_id,
      'in',
      v_quantity,
      p_location_id,
      'purchase',
      v_purchase_id
    );
  END LOOP;

  RETURN v_purchase_id;
END;
$$;

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

CREATE OR REPLACE FUNCTION public.delete_purchase_transaction(p_purchase_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item record;
  v_location_id uuid;
  v_business_id uuid;
  v_purchase_date timestamptz;
  v_sold_product text;
BEGIN
  SELECT location_id, business_id, purchase_date
  INTO v_location_id, v_business_id, v_purchase_date
  FROM public.purchases
  WHERE id = p_purchase_id;

  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'Purchase not found';
  END IF;

  SELECT p.name INTO v_sold_product
  FROM public.purchase_items pi
  JOIN public.products p ON p.id = pi.product_id
  JOIN public.sale_items si ON si.product_id = pi.product_id
  JOIN public.sales s ON s.id = si.sale_id
  WHERE pi.purchase_id = p_purchase_id
    AND s.business_id = v_business_id
    AND s.created_at >= v_purchase_date
  LIMIT 1;

  IF v_sold_product IS NOT NULL THEN
    RAISE EXCEPTION 'This purchase cannot be deleted because product "%" has already been sold after this purchase', v_sold_product;
  END IF;

  FOR v_item IN
    SELECT product_id, quantity
    FROM public.purchase_items
    WHERE purchase_id = p_purchase_id
  LOOP
    IF v_location_id IS NOT NULL THEN
      INSERT INTO public.product_stocks (
        business_id,
        product_id,
        location_id,
        quantity
      )
      VALUES (
        v_business_id,
        v_item.product_id,
        v_location_id,
        -v_item.quantity
      )
      ON CONFLICT (product_id, location_id)
      DO UPDATE SET
        quantity = public.product_stocks.quantity - v_item.quantity,
        business_id = EXCLUDED.business_id;
    END IF;

    UPDATE public.products
    SET stock_quantity = (
      SELECT COALESCE(SUM(quantity), 0)
      FROM public.product_stocks
      WHERE product_id = v_item.product_id
        AND business_id = v_business_id
    )
    WHERE id = v_item.product_id
      AND business_id = v_business_id;

    INSERT INTO public.stock_movements (
      business_id,
      product_id,
      movement_type,
      quantity,
      location_id,
      reference_type,
      reference_id
    )
    VALUES (
      v_business_id,
      v_item.product_id,
      'out',
      v_item.quantity,
      v_location_id,
      'purchase_reversal',
      p_purchase_id
    );
  END LOOP;

  DELETE FROM public.purchases WHERE id = p_purchase_id;
END;
$$;

UPDATE public.products p
SET stock_quantity = totals.quantity
FROM (
  SELECT product_id, business_id, COALESCE(SUM(quantity), 0)::integer AS quantity
  FROM public.product_stocks
  GROUP BY product_id, business_id
) totals
WHERE p.id = totals.product_id
  AND p.business_id = totals.business_id;
