-- Trigger to initialize stock for a new product across all locations of the business
CREATE OR REPLACE FUNCTION public.initialize_product_stocks()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert a stock record for every location belonging to the product's business
  INSERT INTO public.product_stocks (product_id, location_id, quantity, business_id)
  SELECT NEW.id, l.id, 0, NEW.business_id
  FROM public.locations l
  WHERE l.business_id = NEW.business_id
    AND l.is_active = true;
    
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_initialize_product_stocks ON public.products;
CREATE TRIGGER tr_initialize_product_stocks
AFTER INSERT ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.initialize_product_stocks();

-- Also ensure that when a NEW LOCATION is created, all products get a stock record for it
CREATE OR REPLACE FUNCTION public.initialize_location_stocks()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.product_stocks (product_id, location_id, quantity, business_id)
  SELECT p.id, NEW.id, 0, NEW.business_id
  FROM public.products p
  WHERE p.business_id = NEW.business_id;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_initialize_location_stocks ON public.locations;
CREATE TRIGGER tr_initialize_location_stocks
AFTER INSERT ON public.locations
FOR EACH ROW
EXECUTE FUNCTION public.initialize_location_stocks();
