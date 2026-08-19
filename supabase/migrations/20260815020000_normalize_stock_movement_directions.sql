-- Stock movements use signed quantities everywhere: stock in is positive and
-- stock out is negative. This makes sales, reversals and reports unambiguous.
UPDATE public.stock_movements
SET quantity = -abs(quantity)
WHERE movement_type = 'out' AND quantity > 0;

CREATE OR REPLACE FUNCTION public.normalize_stock_movement_quantity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.movement_type = 'out' THEN
    NEW.quantity := -abs(NEW.quantity);
  ELSIF NEW.movement_type = 'in' THEN
    NEW.quantity := abs(NEW.quantity);
  ELSIF NEW.movement_type = 'transfer' THEN
    NEW.quantity := CASE WHEN NEW.location_id IS NOT NULL THEN -abs(NEW.quantity) ELSE abs(NEW.quantity) END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_stock_movement_quantity ON public.stock_movements;
CREATE TRIGGER trg_normalize_stock_movement_quantity
BEFORE INSERT OR UPDATE OF movement_type, quantity, location_id, destination_location_id
ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.normalize_stock_movement_quantity();
