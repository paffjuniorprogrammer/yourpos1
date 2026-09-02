-- Tables managers need room number/type only to print room-service QR codes.
-- This does not grant booking, folio, or room-payment access.

DROP POLICY IF EXISTS "Room staff read business rooms" ON public.rooms;

CREATE POLICY "Hospitality staff read business rooms"
ON public.rooms
FOR SELECT
USING (
  business_id = public.get_user_business_id()
  AND (
    public.has_module_permission('Rooms', 'view')
    OR public.has_module_permission('Tables', 'view')
    OR public.get_user_role() = 'admin'
  )
);

NOTIFY pgrst, 'reload schema';
