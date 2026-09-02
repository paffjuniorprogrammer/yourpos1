-- A cashier who can create a held tab must also be able to close it once the
-- customer pays. Without this, the completed sale succeeds but the tab remains
-- open and returns after a refresh.

DROP POLICY IF EXISTS "Bar staff update held tabs" ON public.active_tabs;

CREATE POLICY "Bar staff update held tabs"
ON public.active_tabs
FOR UPDATE
USING (
  business_id = public.get_user_business_id()
  AND (
    public.has_module_permission('Bar POS', 'add')
    OR public.has_module_permission('Bar POS', 'edit')
    OR public.get_user_role() = 'admin'
  )
)
WITH CHECK (
  business_id = public.get_user_business_id()
  AND (
    public.has_module_permission('Bar POS', 'add')
    OR public.has_module_permission('Bar POS', 'edit')
    OR public.get_user_role() = 'admin'
  )
);

NOTIFY pgrst, 'reload schema';
