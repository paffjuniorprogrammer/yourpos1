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
  v_target_role text;
BEGIN
  -- Get caller info from public.users
  SELECT business_id, role INTO v_caller_business_id, v_caller_role
  FROM public.users
  WHERE auth_user_id = auth.uid();

  -- Super admins can reset anyone
  IF lower(v_caller_role) IN ('super_admin', 'super admin', 'system admin') OR (v_caller_role = 'admin' AND v_caller_business_id IS NULL) THEN
    UPDATE auth.users
    SET encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
        confirmation_token = COALESCE(confirmation_token, ''),
        recovery_token = COALESCE(recovery_token, ''),
        email_change_token_new = COALESCE(email_change_token_new, ''),
        email_change_token_current = COALESCE(email_change_token_current, ''),
        email_change = COALESCE(email_change, ''),
        updated_at = now()
    WHERE id = p_target_auth_id;
    RETURN;
  END IF;

  -- For regular admins
  IF v_caller_role = 'admin' THEN
    -- Get target info
    SELECT business_id, role INTO v_target_business_id, v_target_role
    FROM public.users
    WHERE auth_user_id = p_target_auth_id;

    -- If caller has no business (system admin), allow reset anyone
    IF v_caller_business_id IS NULL THEN
      UPDATE auth.users
      SET encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
          confirmation_token = COALESCE(confirmation_token, ''),
          recovery_token = COALESCE(recovery_token, ''),
          email_change_token_new = COALESCE(email_change_token_new, ''),
          email_change_token_current = COALESCE(email_change_token_current, ''),
          email_change = COALESCE(email_change, ''),
          updated_at = now()
      WHERE id = p_target_auth_id;
      RETURN;
    END IF;

    -- Verify same business (allow admin to admin resets across businesses)
    IF v_caller_business_id IS DISTINCT FROM v_target_business_id AND v_target_role != 'admin' THEN
      RAISE EXCEPTION 'You can only reset passwords for users in your own business.';
    END IF;

    -- Perform reset
    UPDATE auth.users
    SET encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
        confirmation_token = COALESCE(confirmation_token, ''),
        recovery_token = COALESCE(recovery_token, ''),
        email_change_token_new = COALESCE(email_change_token_new, ''),
        email_change_token_current = COALESCE(email_change_token_current, ''),
        email_change = COALESCE(email_change, ''),
        updated_at = now()
    WHERE id = p_target_auth_id;
    RETURN;
  END IF;

  -- Not admin or super_admin
  RAISE EXCEPTION 'Only admins can reset passwords.';
END;
$$;
