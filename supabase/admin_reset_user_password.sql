-- Enable pgcrypto if it doesn't already exist
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Function to allow system owner / admin to reset user passwords
CREATE OR REPLACE FUNCTION public.admin_reset_user_password(
  p_target_auth_id uuid,
  p_new_password text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_caller_business_id uuid;
  v_caller_role text;
  v_target_business_id uuid;
BEGIN
  -- Get caller info from public.users
  SELECT business_id, role INTO v_caller_business_id, v_caller_role
  FROM public.users
  WHERE auth_user_id = auth.uid();

  -- Super admins can reset anyone
  IF v_caller_role = 'super_admin' THEN
    UPDATE auth.users
    SET encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf'))
    WHERE id = p_target_auth_id;
    RETURN;
  END IF;

  -- Verify caller is admin
  IF v_caller_role != 'admin' THEN
    RAISE EXCEPTION 'Only admins can reset passwords.';
  END IF;

  -- Get target info
  SELECT business_id INTO v_target_business_id
  FROM public.users
  WHERE auth_user_id = p_target_auth_id;

  -- Verify same business
  IF v_caller_business_id IS DISTINCT FROM v_target_business_id THEN
    RAISE EXCEPTION 'You can only reset passwords for users in your own business.';
  END IF;

  -- Perform reset
  UPDATE auth.users
  SET encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf'))
  WHERE id = p_target_auth_id;
END;
$$;
