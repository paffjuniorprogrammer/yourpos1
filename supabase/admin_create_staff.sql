-- Enable pgcrypto if it doesn't already exist
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Function to allow system owner / admin to create staff without losing their own login session
CREATE OR REPLACE FUNCTION public.admin_create_staff(
  p_business_id uuid,
  p_email text,
  p_password text,
  p_full_name text,
  p_role text,
  p_location_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_auth_user_id uuid := extensions.gen_random_uuid();
BEGIN
  -- Check permission: caller must be Admin for that business, or platform admin
  IF NOT (public.is_platform_admin() OR (public.get_user_role() = 'admin' AND public.get_user_business_id() = p_business_id)) THEN
    RAISE EXCEPTION 'Access Denied: Only Business Admins can create staff';
  END IF;

  -- Create Auth User directly into the identity system
  INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    aud,
    role,
    created_at,
    updated_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change_token_current,
    email_change,
    is_super_admin
  ) VALUES (
    v_auth_user_id,
    '00000000-0000-0000-0000-000000000000',
    p_email,
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    now(),
    jsonb_build_object('provider', 'email', 'providers', array['email'], 'role', p_role, 'business_id', p_business_id),
    jsonb_build_object('full_name', p_full_name),
    'authenticated',
    'authenticated',
    now(),
    now(),
    '',
    '',
    '',
    '',
    '',
    false
  );

  -- MANDATORY: Create Identity record for the user to be able to login
  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    extensions.gen_random_uuid(),
    v_auth_user_id,
    jsonb_build_object('sub', v_auth_user_id, 'email', p_email),
    'email',
    v_auth_user_id::text,
    now(),
    now(),
    now()
  );

  -- The Supabase trigger 'on_auth_user_created' fires here and inserts a row into public.users.
  -- We immediately update the user's location, so it's fully populated for the frontend in one transaction
  UPDATE public.users 
  SET location_id = p_location_id 
  WHERE auth_user_id = v_auth_user_id;

  RETURN v_auth_user_id;
END;
$$;
