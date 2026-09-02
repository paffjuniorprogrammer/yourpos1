-- Staff who are allowed to view Sales or Reports may resolve staff names for
-- records in their own business. This never grants cross-business visibility.

DROP POLICY IF EXISTS "Users can view active own profile or admin all" ON public.users;
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
    )
  )
);

NOTIFY pgrst, 'reload schema';
