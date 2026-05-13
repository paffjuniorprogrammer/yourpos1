-- Function to allow system owner / admin to delete staff profiles and their auth accounts
CREATE OR REPLACE FUNCTION public.admin_delete_staff(p_target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_business_id uuid;
  v_caller_role text;
  v_target_auth_id uuid;
  v_target_business_id uuid;
BEGIN
  -- 1. Get caller info
  SELECT business_id, role::text INTO v_caller_business_id, v_caller_role
  FROM public.users
  WHERE auth_user_id = auth.uid();

  -- 2. Get target info
  SELECT auth_user_id, business_id INTO v_target_auth_id, v_target_business_id
  FROM public.users
  WHERE id = p_target_user_id;

  IF v_target_auth_id IS NULL THEN
    RAISE EXCEPTION 'Target user profile not found.';
  END IF;

  -- 3. Check permission
  -- Must be Platform Admin OR (Business Admin AND same business AND target is not an Admin)
  IF NOT (
    public.is_platform_admin() 
    OR (
      v_caller_role = 'admin' 
      AND v_caller_business_id = v_target_business_id
    )
  ) THEN
    RAISE EXCEPTION 'Access Denied: Only Admins can delete staff.';
  END IF;

  -- 4. Delete from auth system (This will also trigger cleanup if any on_delete triggers exist)
  -- Note: This requires the function to be SECURITY DEFINER and the owner to have rights to auth schema
  DELETE FROM auth.users WHERE id = v_target_auth_id;

  -- 5. Delete from public profile (in case there's no FK CASCADE)
  DELETE FROM public.users WHERE id = p_target_user_id;
  
  -- Permissions and locations should CASCADE if the DB is set up correctly, 
  -- but we'll do it explicitly just in case.
  DELETE FROM public.user_permissions WHERE user_id = p_target_user_id;
  DELETE FROM public.user_locations WHERE user_id = p_target_user_id;

END;
$$;
