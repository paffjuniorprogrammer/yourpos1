-- ====================================================================
-- MASTER FIX: Update Auth Trigger & Repair Business Admin Accounts
-- Run this in Supabase Dashboard -> SQL Editor
-- ====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 1. FIX THE TRIGGER FUNCTION handle_new_auth_user()
-- Adds ON CONFLICT (business_id, email) DO UPDATE so inserting auth users never throws duplicate key errors.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
SET row_security = off
AS $$
DECLARE
  v_business_id uuid;
  v_business_name text;
  v_role public.app_role;
  v_role_meta text;
  v_user_id uuid;
BEGIN
  -- Look for business_id in app_metadata or user_metadata
  v_business_id := coalesce(
    nullif(new.raw_app_meta_data ->> 'business_id', ''),
    nullif(new.raw_user_meta_data ->> 'business_id', '')
  )::uuid;

  -- Extract role from metadata
  v_role_meta := lower(coalesce(
    new.raw_app_meta_data ->> 'role',
    new.raw_user_meta_data ->> 'role',
    ''
  ));

  IF v_business_id IS NULL THEN
    -- Fallback: check if an unlinked record in public.users exists for this email
    SELECT business_id INTO v_business_id
    FROM public.users
    WHERE email = new.email AND business_id IS NOT NULL
    LIMIT 1;
  END IF;

  IF v_business_id IS NULL THEN
    v_business_name := coalesce(
      nullif(new.raw_user_meta_data ->> 'business_name', ''),
      split_part(new.email, '@', 1) || ' Business'
    );

    INSERT INTO public.businesses (name, owner_auth_user_id)
    VALUES (v_business_name, new.id)
    RETURNING id INTO v_business_id;

    v_role := 'admin'::public.app_role;
  ELSE
    IF v_role_meta IN ('admin', 'manager', 'cashier', 'receptionist', 'waiter', 'storekeeper') THEN
      v_role := v_role_meta::public.app_role;
    ELSE
      v_role := 'admin'::public.app_role;
    END IF;
  END IF;

  -- Safe INSERT or UPDATE into public.users
  INSERT INTO public.users (
    auth_user_id,
    business_id,
    email,
    full_name,
    role,
    is_active
  ) VALUES (
    new.id,
    v_business_id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    v_role,
    true
  )
  ON CONFLICT (business_id, email) DO UPDATE
  SET
    auth_user_id = excluded.auth_user_id,
    full_name = coalesce(excluded.full_name, public.users.full_name),
    role = coalesce(excluded.role, public.users.role),
    is_active = true
  RETURNING id INTO v_user_id;

  RETURN new;
END;
$$;


-- 2. FIX CREATE_BUSINESS_WITH_ADMIN RPC
CREATE OR REPLACE FUNCTION public.create_business_with_admin(
  p_biz_name text,
  p_admin_email text,
  p_admin_password text,
  p_admin_name text,
  p_plan_id uuid,
  p_status text,
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_business_type text DEFAULT 'retail'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_business_id uuid;
  v_auth_user_id uuid := gen_random_uuid();
  v_location_id uuid;
BEGIN
  -- 1. Create Business
  INSERT INTO public.businesses (
    name, 
    plan_id, 
    status, 
    subscription_start_date, 
    subscription_end_date,
    business_type
  ) VALUES (
    p_biz_name, 
    p_plan_id, 
    p_status, 
    p_start_date, 
    p_end_date,
    COALESCE(p_business_type, 'retail')
  ) RETURNING id INTO v_business_id;

  -- 2. Create Default Location
  INSERT INTO public.locations (
    business_id,
    name,
    type,
    is_active
  ) VALUES (
    v_business_id,
    'Main Branch',
    'main',
    true
  ) RETURNING id INTO v_location_id;

  -- 3. Check if user already exists in auth.users
  SELECT id INTO v_auth_user_id FROM auth.users WHERE email = p_admin_email LIMIT 1;

  IF v_auth_user_id IS NULL THEN
    v_auth_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      id,
      instance_id,
      email,
      encrypted_password,
      email_confirmed_at,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change_token_current,
      email_change,
      raw_app_meta_data,
      raw_user_meta_data,
      aud,
      role,
      created_at,
      updated_at
    ) VALUES (
      v_auth_user_id,
      '00000000-0000-0000-0000-000000000000',
      p_admin_email,
      extensions.crypt(p_admin_password, extensions.gen_salt('bf')),
      now(),
      '', '', '', '', '',
      jsonb_build_object('provider', 'email', 'providers', array['email'], 'role', 'admin', 'business_id', v_business_id),
      jsonb_build_object('full_name', p_admin_name, 'business_id', v_business_id),
      'authenticated',
      'authenticated',
      now(),
      now()
    );
  ELSE
    -- Update password and metadata for existing auth user
    UPDATE auth.users
    SET 
      encrypted_password = extensions.crypt(p_admin_password, extensions.gen_salt('bf')),
      email_confirmed_at = COALESCE(email_confirmed_at, now()),
      raw_app_meta_data = jsonb_build_object('provider', 'email', 'providers', array['email'], 'role', 'admin', 'business_id', v_business_id),
      raw_user_meta_data = jsonb_build_object('full_name', p_admin_name, 'business_id', v_business_id),
      updated_at = now()
    WHERE id = v_auth_user_id;
  END IF;

  -- 4. Ensure public.users entry exists and has location_id
  INSERT INTO public.users (
    auth_user_id,
    business_id,
    location_id,
    full_name,
    email,
    role,
    is_active
  ) VALUES (
    v_auth_user_id,
    v_business_id,
    v_location_id,
    p_admin_name,
    p_admin_email,
    'admin',
    true
  )
  ON CONFLICT (business_id, email) DO UPDATE
  SET 
    auth_user_id = excluded.auth_user_id,
    location_id = excluded.location_id,
    role = 'admin',
    is_active = true;

  -- 5. Initial Shop Settings
  INSERT INTO public.shop_settings (
    business_id,
    shop_name
  ) VALUES (
    v_business_id,
    p_biz_name
  )
  ON CONFLICT (business_id) DO NOTHING;

  RETURN v_business_id;
END;
$$;


-- 3. REPAIR EXISTING UNLINKED BUSINESS ADMINS (e.g. bar@gmail.com / bar&guest)
DO $$
DECLARE
  r RECORD;
  v_auth_id uuid;
BEGIN
  FOR r IN 
    SELECT u.id AS public_user_id, u.email, u.full_name, u.business_id 
    FROM public.users u
    WHERE u.auth_user_id IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id = u.auth_user_id)
  LOOP
    SELECT id INTO v_auth_id FROM auth.users WHERE email = r.email LIMIT 1;
    
    IF v_auth_id IS NULL THEN
      v_auth_id := gen_random_uuid();
      INSERT INTO auth.users (
        id,
        instance_id,
        email,
        encrypted_password,
        email_confirmed_at,
        confirmation_token,
        recovery_token,
        email_change_token_new,
        email_change_token_current,
        email_change,
        raw_app_meta_data,
        raw_user_meta_data,
        aud,
        role,
        created_at,
        updated_at
      ) VALUES (
        v_auth_id,
        '00000000-0000-0000-0000-000000000000',
        r.email,
        extensions.crypt('Password123', extensions.gen_salt('bf')),
        now(),
        '', '', '', '', '',
        jsonb_build_object('provider', 'email', 'providers', array['email'], 'role', 'admin', 'business_id', r.business_id),
        jsonb_build_object('full_name', r.full_name, 'business_id', r.business_id),
        'authenticated',
        'authenticated',
        now(),
        now()
      );
    ELSE
      UPDATE auth.users
      SET 
        encrypted_password = extensions.crypt('Password123', extensions.gen_salt('bf')),
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        updated_at = now()
      WHERE id = v_auth_id;
    END IF;

    UPDATE public.users
    SET auth_user_id = v_auth_id
    WHERE id = r.public_user_id;
  END LOOP;
END;
$$;
