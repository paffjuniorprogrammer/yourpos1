-- Reception and bar staff need to identify who accepted a guest charge.
-- Visibility remains limited to staff in the same business with an authorised
-- hospitality module; this never exposes users across businesses.

DROP POLICY IF EXISTS "Users can view authorized business staff" ON public.users;

CREATE POLICY "Users can view authorized business staff"
ON public.users
FOR SELECT
USING (
  auth.uid() = auth_user_id
  OR public.is_platform_admin()
  OR (
    business_id = public.get_user_business_id()
    AND (
      public.get_user_role() = 'admin'
      OR public.has_module_permission('Sales', 'view')
      OR public.has_module_permission('Reports', 'view')
      OR public.has_module_permission('Rooms', 'view')
      OR public.has_module_permission('Bar POS', 'view')
    )
  )
);

NOTIFY pgrst, 'reload schema';
