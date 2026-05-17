-- Fix Staff Login Issues
-- This script fixes issues where staff cannot login when created by admin

-- 0. Fix Supabase Auth token fields that must be empty strings, not NULL.
-- If these are NULL, /auth/v1/token can return 500 "Database error querying schema".
UPDATE auth.users
SET
  confirmation_token = COALESCE(confirmation_token, ''),
  recovery_token = COALESCE(recovery_token, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  email_change = COALESCE(email_change, ''),
  raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb),
  raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb),
  updated_at = now()
WHERE
  confirmation_token IS NULL
  OR recovery_token IS NULL
  OR email_change_token_new IS NULL
  OR email_change_token_current IS NULL
  OR email_change IS NULL
  OR raw_app_meta_data IS NULL
  OR raw_user_meta_data IS NULL;

-- 1. Fix any users with NULL business_id by using the business_id from their location or auth metadata
DO $$
DECLARE
  v_user_id uuid;
  v_location_id uuid;
  v_location_business_id uuid;
BEGIN
  -- Find users with NULL business_id
  FOR v_user_id IN
    SELECT id FROM public.users WHERE business_id IS NULL LIMIT 100
  LOOP
    -- Try to get business_id from location
    SELECT location_id INTO v_location_id
    FROM public.users
    WHERE id = v_user_id;
    
    IF v_location_id IS NOT NULL THEN
      SELECT business_id INTO v_location_business_id 
      FROM public.locations 
      WHERE id = v_location_id;
      
      IF v_location_business_id IS NOT NULL THEN
        UPDATE public.users 
        SET business_id = v_location_business_id 
        WHERE id = v_user_id;
      END IF;
    END IF;
  END LOOP;
  
  -- If still NULL, assign to first business (fallback)
  UPDATE public.users 
  SET business_id = (SELECT id FROM public.businesses ORDER BY created_at LIMIT 1)
  WHERE business_id IS NULL;
  
  RAISE NOTICE 'Fixed % users with NULL business_id', (SELECT COUNT(*) FROM public.users WHERE business_id IS NOT NULL);
END $$;

-- 2. Improve handle_new_auth_user to properly extract business_id from jwt claims
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
  -- Look for business_id in app_metadata (server-set) or user_metadata (client-passed fallback)
  v_business_id := coalesce(
    nullif(new.raw_app_meta_data ->> 'business_id', ''),
    nullif(new.raw_user_meta_data ->> 'business_id', '')
  )::uuid;

  -- Extract role from either app_meta (preferred) or user_meta (for standard frontend signUp)
  v_role_meta := lower(coalesce(
    new.raw_app_meta_data ->> 'role',
    new.raw_user_meta_data ->> 'role',
    ''
  ));

  if v_business_id is null then
    -- 1. Create a NEW business for this user (First Admin)
    v_business_name := coalesce(
      nullif(new.raw_user_meta_data ->> 'business_name', ''),
      split_part(new.email, '@', 1) || ' Business'
    );

    insert into public.businesses (name, owner_auth_user_id)
    values (v_business_name, new.id)
    returning id into v_business_id;
  end if;

  -- Determine the role
  IF v_role_meta IN ('admin', 'manager', 'cashier') THEN
    v_role := v_role_meta::public.app_role;
  ELSE
    v_role := 'cashier'::public.app_role;
  END IF;

  -- Insert into public.users
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
  RETURNING id INTO v_user_id;

  RETURN new;
END;
$$;

-- 3. Add missing indexes to improve performance of auth queries
CREATE INDEX IF NOT EXISTS idx_users_auth_user_id ON public.users(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_users_business_id ON public.users(business_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON public.users(is_active);

-- 4. Improve get_user_business_id to handle NULL auth.uid() gracefully
CREATE OR REPLACE FUNCTION public.get_user_business_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
SET row_security = off
AS $$
DECLARE
  v_business_id uuid;
  v_auth_uid uuid;
BEGIN
  -- Get the auth user ID first
  v_auth_uid := auth.uid();
  
  -- If auth.uid() is NULL, return NULL (not authenticated)
  IF v_auth_uid IS NULL THEN
    RETURN NULL;
  END IF;

  -- 1. Try to get from JWT claims (fastest, avoids DB lookup during RLS)
  v_business_id := (auth.jwt() -> 'app_metadata' ->> 'business_id')::uuid;
  if v_business_id is not null then
    return v_business_id;
  end if;

  -- 2. Fallback to DB lookup with proper error handling
  BEGIN
    SELECT business_id INTO v_business_id
    FROM public.users
    WHERE auth_user_id = v_auth_uid
      AND is_active = true
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
  
  RETURN v_business_id;
END;
$$;

-- 5. Ensure all staff users have the correct business_id when created
COMMENT ON FUNCTION public.admin_create_staff(uuid, text, text, text, text, uuid) IS 'Creates a staff user with proper business_id assignment for RLS policies';

-- 6. Create an audit trail for troubleshooting
CREATE TABLE IF NOT EXISTS public.staff_creation_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES public.users(auth_user_id) ON DELETE SET NULL,
  staff_user_id uuid REFERENCES public.users(auth_user_id) ON DELETE SET NULL,
  staff_email text NOT NULL,
  business_id uuid REFERENCES public.businesses(id) ON DELETE SET NULL,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  staff_role text NOT NULL,
  created_at timestamptz DEFAULT now(),
  status text DEFAULT 'created',
  error_message text
);

ALTER TABLE public.staff_creation_audit ENABLE ROW LEVEL SECURITY;

-- Policy for admins to view audit
CREATE POLICY "Admins view staff creation audit"
ON public.staff_creation_audit
FOR SELECT
USING (
  public.is_platform_admin()
  OR (public.get_user_role() = 'admin' AND business_id = public.get_user_business_id())
);

-- Add note
-- If staff still can't login after this migration:
-- 1. Manually check: SELECT id, email, auth_user_id, business_id FROM public.users WHERE email = 'staff@email.com';
-- 2. Verify business_id is NOT NULL
-- 3. Verify location_id is set correctly
-- 4. Check if there are any RLS policy violations: SELECT * FROM pg_policies WHERE tablename = 'users';
