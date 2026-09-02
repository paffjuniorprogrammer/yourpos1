-- Hospitality accounting: room charges are accrued to a guest folio; payments
-- are recorded by reception and never counted as bar-cash takings.

CREATE TABLE IF NOT EXISTS public.room_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES public.room_bookings(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  payment_method public.payment_method NOT NULL,
  received_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  notes text
);

CREATE INDEX IF NOT EXISTS idx_room_payments_booking ON public.room_payments(booking_id, received_at DESC);

CREATE OR REPLACE FUNCTION public.set_room_payment_business_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT business_id INTO NEW.business_id FROM public.room_bookings WHERE id = NEW.booking_id;
  IF NEW.business_id IS NULL THEN RAISE EXCEPTION 'Room booking not found'; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_room_payment_business_id ON public.room_payments;
CREATE TRIGGER trg_set_room_payment_business_id
BEFORE INSERT ON public.room_payments
FOR EACH ROW EXECUTE FUNCTION public.set_room_payment_business_id();

ALTER TABLE public.room_payments ENABLE ROW LEVEL SECURITY;

-- Replace permissive hospitality policies left by the initial module migration.
DROP POLICY IF EXISTS rooms_all ON public.rooms;
DROP POLICY IF EXISTS room_bookings_all ON public.room_bookings;
DROP POLICY IF EXISTS room_charges_all ON public.room_charges;
DROP POLICY IF EXISTS dining_tables_all ON public.dining_tables;
DROP POLICY IF EXISTS active_tabs_all ON public.active_tabs;
DROP POLICY IF EXISTS printer_configs_all ON public.printer_configurations;
DROP POLICY IF EXISTS day_closures_all ON public.day_closures;
DROP POLICY IF EXISTS "Business users access rooms" ON public.rooms;
DROP POLICY IF EXISTS "Business users access bookings" ON public.room_bookings;
DROP POLICY IF EXISTS "Business users read room charges" ON public.room_charges;
DROP POLICY IF EXISTS "Bar staff add room charges" ON public.room_charges;
DROP POLICY IF EXISTS "Reception records room payments" ON public.room_payments;
DROP POLICY IF EXISTS "Business users access dining tables" ON public.dining_tables;
DROP POLICY IF EXISTS "Business users access held tabs" ON public.active_tabs;

CREATE POLICY "Room staff read business rooms" ON public.rooms FOR SELECT
USING (business_id = public.get_user_business_id() AND (public.has_module_permission('Rooms', 'view') OR public.get_user_role() = 'admin'));
CREATE POLICY "Room staff add business rooms" ON public.rooms FOR INSERT
WITH CHECK (business_id = public.get_user_business_id() AND (public.has_module_permission('Rooms', 'add') OR public.get_user_role() = 'admin'));
CREATE POLICY "Room staff edit business rooms" ON public.rooms FOR UPDATE
USING (business_id = public.get_user_business_id() AND (public.has_module_permission('Rooms', 'edit') OR public.get_user_role() = 'admin'))
WITH CHECK (business_id = public.get_user_business_id() AND (public.has_module_permission('Rooms', 'edit') OR public.get_user_role() = 'admin'));
CREATE POLICY "Room staff delete business rooms" ON public.rooms FOR DELETE
USING (business_id = public.get_user_business_id() AND (public.has_module_permission('Rooms', 'delete') OR public.get_user_role() = 'admin'));

-- Bar staff can look up an active guest folio, but only reception can alter a booking.
CREATE POLICY "Hospitality staff read business bookings" ON public.room_bookings FOR SELECT
USING (business_id = public.get_user_business_id() AND (public.has_module_permission('Rooms', 'view') OR public.has_module_permission('Bar POS', 'view') OR public.get_user_role() = 'admin'));
CREATE POLICY "Reception add bookings" ON public.room_bookings FOR INSERT
WITH CHECK (business_id = public.get_user_business_id() AND (public.has_module_permission('Rooms', 'add') OR public.get_user_role() = 'admin'));
CREATE POLICY "Reception edit bookings" ON public.room_bookings FOR UPDATE
USING (business_id = public.get_user_business_id() AND (public.has_module_permission('Rooms', 'edit') OR public.get_user_role() = 'admin'))
WITH CHECK (business_id = public.get_user_business_id() AND (public.has_module_permission('Rooms', 'edit') OR public.get_user_role() = 'admin'));
CREATE POLICY "Reception delete bookings" ON public.room_bookings FOR DELETE
USING (business_id = public.get_user_business_id() AND (public.has_module_permission('Rooms', 'delete') OR public.get_user_role() = 'admin'));

CREATE POLICY "Business users read room charges" ON public.room_charges FOR SELECT
USING (business_id = public.get_user_business_id() AND (public.has_module_permission('Rooms', 'view') OR public.has_module_permission('Bar POS', 'view') OR public.get_user_role() = 'admin'));
CREATE POLICY "Bar staff add room charges" ON public.room_charges FOR INSERT
WITH CHECK (business_id = public.get_user_business_id() AND (public.has_module_permission('Bar POS', 'add') OR public.has_module_permission('Rooms', 'add') OR public.get_user_role() = 'admin'));

CREATE POLICY "Reception reads room payments" ON public.room_payments FOR SELECT
USING (business_id = public.get_user_business_id() AND (public.has_module_permission('Rooms', 'view') OR public.get_user_role() = 'admin'))
;
CREATE POLICY "Reception records room payments" ON public.room_payments FOR INSERT
WITH CHECK (business_id = public.get_user_business_id() AND (public.has_module_permission('Rooms', 'add') OR public.get_user_role() = 'admin'));

CREATE POLICY "Hospitality staff read dining tables" ON public.dining_tables FOR SELECT
USING (business_id = public.get_user_business_id() AND (public.has_module_permission('Tables', 'view') OR public.has_module_permission('Bar POS', 'view') OR public.get_user_role() = 'admin'))
;
CREATE POLICY "Table staff add dining tables" ON public.dining_tables FOR INSERT
WITH CHECK (business_id = public.get_user_business_id() AND (public.has_module_permission('Tables', 'add') OR public.get_user_role() = 'admin'));
CREATE POLICY "Hospitality staff update dining tables" ON public.dining_tables FOR UPDATE
USING (business_id = public.get_user_business_id() AND (public.has_module_permission('Tables', 'edit') OR public.has_module_permission('Bar POS', 'edit') OR public.get_user_role() = 'admin'))
WITH CHECK (business_id = public.get_user_business_id() AND (public.has_module_permission('Tables', 'edit') OR public.has_module_permission('Bar POS', 'edit') OR public.get_user_role() = 'admin'));
CREATE POLICY "Table staff delete dining tables" ON public.dining_tables FOR DELETE
USING (business_id = public.get_user_business_id() AND (public.has_module_permission('Tables', 'delete') OR public.get_user_role() = 'admin'));

CREATE POLICY "Bar staff read held tabs" ON public.active_tabs FOR SELECT
USING (business_id = public.get_user_business_id() AND (public.has_module_permission('Bar POS', 'view') OR public.get_user_role() = 'admin'))
;
CREATE POLICY "Bar staff add held tabs" ON public.active_tabs FOR INSERT
WITH CHECK (business_id = public.get_user_business_id() AND (public.has_module_permission('Bar POS', 'add') OR public.get_user_role() = 'admin'));
CREATE POLICY "Bar staff update held tabs" ON public.active_tabs FOR UPDATE
USING (business_id = public.get_user_business_id() AND (public.has_module_permission('Bar POS', 'edit') OR public.get_user_role() = 'admin'))
WITH CHECK (business_id = public.get_user_business_id() AND (public.has_module_permission('Bar POS', 'edit') OR public.get_user_role() = 'admin'));
CREATE POLICY "Bar staff delete held tabs" ON public.active_tabs FOR DELETE
USING (business_id = public.get_user_business_id() AND (public.has_module_permission('Bar POS', 'delete') OR public.get_user_role() = 'admin'));

CREATE POLICY "Bar staff read day closures" ON public.day_closures FOR SELECT
USING (business_id = public.get_user_business_id() AND (public.has_module_permission('Bar POS', 'view') OR public.get_user_role() = 'admin'));
CREATE POLICY "Bar staff record day closures" ON public.day_closures FOR INSERT
WITH CHECK (business_id = public.get_user_business_id() AND (public.has_module_permission('Bar POS', 'add') OR public.get_user_role() = 'admin'));
CREATE POLICY "Bar staff update day closures" ON public.day_closures FOR UPDATE
USING (business_id = public.get_user_business_id() AND (public.has_module_permission('Bar POS', 'edit') OR public.get_user_role() = 'admin'))
WITH CHECK (business_id = public.get_user_business_id() AND (public.has_module_permission('Bar POS', 'edit') OR public.get_user_role() = 'admin'));

NOTIFY pgrst, 'reload schema';
