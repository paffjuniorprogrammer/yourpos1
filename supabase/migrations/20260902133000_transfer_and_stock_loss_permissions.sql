-- Separate staff permissions for transfers and stock write-offs.

DROP POLICY IF EXISTS "Staff read stock counts" ON public.stock_counts;
CREATE POLICY "Staff read stock counts"
ON public.stock_counts FOR SELECT
USING (
  public.is_platform_admin()
  OR (
    business_id = public.get_user_business_id()
    AND (
      public.has_module_permission('Stock', 'view')
      OR public.has_module_permission('Stock Loss', 'view')
    )
  )
);

DROP POLICY IF EXISTS "Staff read stock count items" ON public.stock_count_items;
CREATE POLICY "Staff read stock count items"
ON public.stock_count_items FOR SELECT
USING (
  public.is_platform_admin()
  OR (
    business_id = public.get_user_business_id()
    AND (
      public.has_module_permission('Stock', 'view')
      OR public.has_module_permission('Stock Loss', 'view')
    )
  )
);

CREATE POLICY "Transfer permission read transfers"
ON public.stock_transfers FOR SELECT
USING (
  public.has_module_permission('Transfers', 'view')
  AND business_id = public.get_user_business_id()
  AND (public.user_has_location(from_location_id) OR public.user_has_location(to_location_id))
);

CREATE POLICY "Transfer permission create transfers"
ON public.stock_transfers FOR INSERT
WITH CHECK (
  public.has_module_permission('Transfers', 'add')
  AND business_id = public.get_user_business_id()
  AND public.user_has_location(from_location_id)
  AND status <> 'completed'
);

CREATE POLICY "Transfer permission update transfers"
ON public.stock_transfers FOR UPDATE
USING (
  public.has_module_permission('Transfers', 'edit')
  AND business_id = public.get_user_business_id()
  AND status <> 'completed'
  AND (
    created_by = public.get_current_user_id()
    OR (public.user_has_location(to_location_id) AND created_by <> public.get_current_user_id())
  )
)
WITH CHECK (
  public.has_module_permission('Transfers', 'edit')
  AND business_id = public.get_user_business_id()
  AND (
    (created_by = public.get_current_user_id() AND status <> 'completed' AND public.user_has_location(from_location_id))
    OR (created_by <> public.get_current_user_id() AND status = 'completed' AND public.user_has_location(to_location_id))
  )
);

CREATE POLICY "Transfer permission delete transfers"
ON public.stock_transfers FOR DELETE
USING (
  public.has_module_permission('Transfers', 'delete')
  AND business_id = public.get_user_business_id()
  AND status <> 'completed'
  AND created_by = public.get_current_user_id()
);

CREATE POLICY "Transfer permission read items"
ON public.stock_transfer_items FOR SELECT
USING (
  public.has_module_permission('Transfers', 'view')
  AND business_id = public.get_user_business_id()
  AND public.user_can_access_transfer(stock_transfer_id)
);

CREATE POLICY "Transfer permission manage items"
ON public.stock_transfer_items FOR ALL
USING (
  public.has_module_permission('Transfers', 'edit')
  AND business_id = public.get_user_business_id()
  AND EXISTS (
    SELECT 1 FROM public.stock_transfers st
    WHERE st.id = stock_transfer_id AND st.business_id = public.get_user_business_id()
      AND st.status <> 'completed' AND st.created_by = public.get_current_user_id()
      AND public.user_has_location(st.from_location_id)
  )
)
WITH CHECK (
  public.has_module_permission('Transfers', 'add')
  AND business_id = public.get_user_business_id()
  AND EXISTS (
    SELECT 1 FROM public.stock_transfers st
    WHERE st.id = stock_transfer_id AND st.business_id = public.get_user_business_id()
      AND st.status <> 'completed' AND st.created_by = public.get_current_user_id()
      AND public.user_has_location(st.from_location_id)
  )
);

NOTIFY pgrst, 'reload schema';
