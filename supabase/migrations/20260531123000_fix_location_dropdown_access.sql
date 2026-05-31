-- Ensure staff can read active business locations for purchase/product/stock dropdowns.

ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_locations ENABLE ROW LEVEL SECURITY;

UPDATE public.locations
SET is_active = true
WHERE is_active IS NULL;

DO $$
DECLARE
  v_business_id uuid;
BEGIN
  SELECT id INTO v_business_id
  FROM public.businesses
  LIMIT 1;

  IF (SELECT count(*) FROM public.businesses) = 1 THEN
    UPDATE public.locations
    SET business_id = v_business_id
    WHERE business_id IS NULL;
  END IF;
END $$;

INSERT INTO public.user_locations (user_id, location_id, business_id)
SELECT u.id, u.location_id, u.business_id
FROM public.users u
WHERE u.location_id IS NOT NULL
  AND u.business_id IS NOT NULL
ON CONFLICT (user_id, location_id) DO UPDATE
SET business_id = EXCLUDED.business_id;

DROP POLICY IF EXISTS "Authenticated staff read locations" ON public.locations;
CREATE POLICY "Authenticated staff read locations"
ON public.locations
FOR SELECT
TO authenticated
USING (
  public.is_platform_admin()
  OR business_id = public.get_user_business_id()
);

DROP POLICY IF EXISTS "Authenticated staff read user_locations" ON public.user_locations;
CREATE POLICY "Authenticated staff read user_locations"
ON public.user_locations
FOR SELECT
TO authenticated
USING (
  public.is_platform_admin()
  OR business_id = public.get_user_business_id()
);
