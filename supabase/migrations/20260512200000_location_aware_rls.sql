-- Helper to check if current user is assigned to a specific location
CREATE OR REPLACE FUNCTION public.is_user_assigned_to_location(p_location_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND (
        u.location_id = p_location_id  -- Primary location
        OR EXISTS (                     -- Additional assigned locations
          SELECT 1 FROM public.user_locations ul
          WHERE ul.user_id = u.id
            AND ul.location_id = p_location_id
        )
      )
  );
END;
$$;

-- Update Sales RLS to be location-aware
DROP POLICY IF EXISTS "Authenticated staff read sales" ON public.sales;
CREATE POLICY "Authenticated staff read sales"
ON public.sales
FOR SELECT
USING (
  business_id = public.get_user_business_id()
  AND (
    public.is_platform_admin()
    OR public.has_module_permission('Sales', 'view')
    OR public.is_user_assigned_to_location(location_id)
  )
);

-- Update Product Stocks RLS to be location-aware
DROP POLICY IF EXISTS "Authenticated staff read product_stocks" ON public.product_stocks;
CREATE POLICY "Authenticated staff read product_stocks"
ON public.product_stocks
FOR SELECT
USING (
  business_id = public.get_user_business_id()
  AND (
    public.is_platform_admin()
    OR public.has_module_permission('Inventory', 'view')
    OR public.has_module_permission('Products', 'view')
    OR public.is_user_assigned_to_location(location_id)
  )
);

-- Update Stock Movements RLS
DROP POLICY IF EXISTS "Authenticated staff read stock_movements" ON public.stock_movements;
CREATE POLICY "Authenticated staff read stock_movements"
ON public.stock_movements
FOR SELECT
USING (
  business_id = public.get_user_business_id()
  AND (
    public.is_platform_admin()
    OR public.has_module_permission('Inventory', 'view')
    OR public.is_user_assigned_to_location(location_id)
  )
);

-- Update Purchases RLS
DROP POLICY IF EXISTS "Authenticated staff read purchases" ON public.purchases;
CREATE POLICY "Authenticated staff read purchases"
ON public.purchases
FOR SELECT
USING (
  business_id = public.get_user_business_id()
  AND (
    public.is_platform_admin()
    OR public.has_module_permission('Purchases', 'view')
    OR public.is_user_assigned_to_location(location_id)
  )
);
