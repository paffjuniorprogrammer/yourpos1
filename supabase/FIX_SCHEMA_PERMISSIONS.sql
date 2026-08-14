-- TARGETED FIX FOR "DATABASE ERROR QUERYING SCHEMA"
-- Run this script in your Supabase SQL Editor to apply only the necessary permission fixes.

-- 1. Optimized Role Lookup (Prevents RLS Recursion)
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS public.app_role
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
SET row_security = off
AS $$
DECLARE
  v_role text;
BEGIN
  IF public.is_platform_admin() THEN
    RETURN 'admin'::public.app_role;
  END IF;

  -- Try to get from JWT claims (fastest, avoids DB lookup during RLS)
  v_role := auth.jwt() -> 'app_metadata' ->> 'role';
  IF v_role IS NOT NULL THEN
    v_role := lower(v_role);
    IF v_role = 'casher' THEN v_role := 'cashier'; END IF;
    IF v_role IN ('admin', 'manager', 'cashier') THEN
      RETURN v_role::public.app_role;
    END IF;
  END IF;

  -- Fallback to DB
  SELECT role::text INTO v_role
  FROM public.users
  WHERE auth_user_id = auth.uid()
    AND is_active = true
  LIMIT 1;
  
  RETURN COALESCE(v_role, 'cashier')::public.app_role;
END;
$$;

-- 2. Optimized Business ID Lookup
CREATE OR REPLACE FUNCTION public.get_user_business_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
SET row_security = off
AS $$
DECLARE
  v_business_id uuid;
BEGIN
  -- Try to get from JWT claims
  v_business_id := (auth.jwt() -> 'app_metadata' ->> 'business_id')::uuid;
  IF v_business_id IS NOT NULL THEN
    RETURN v_business_id;
  END IF;

  -- Fallback to DB
  SELECT business_id INTO v_business_id
  FROM public.users
  WHERE auth_user_id = auth.uid()
    AND is_active = true
  LIMIT 1;
  
  RETURN v_business_id;
END;
$$;

-- 3. Simplified Location Lookup (Removes information_schema dependency)
CREATE OR REPLACE FUNCTION public.get_user_location()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
SET row_security = off
AS $$
DECLARE
  v_location_id uuid;
BEGIN
  SELECT location_id INTO v_location_id
  FROM public.users
  WHERE auth_user_id = auth.uid()
    AND is_active = true
  LIMIT 1;
  
  RETURN v_location_id;
END;
$$;

-- 4. Fix Search Path for Module Permissions
CREATE OR REPLACE FUNCTION public.has_module_permission(p_module text, p_action text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
SET row_security = off
AS $$
DECLARE
  v_perm_column text;
  v_has_perm boolean;
BEGIN
  IF public.is_platform_admin() THEN RETURN true; END IF;
  IF public.get_user_role() = 'admin' THEN RETURN true; END IF;

  v_perm_column := CASE lower(p_action)
    WHEN 'view' THEN 'can_view'
    WHEN 'add' THEN 'can_add'
    WHEN 'edit' THEN 'can_edit'
    WHEN 'delete' THEN 'can_delete'
    ELSE NULL
  END;

  IF v_perm_column IS NULL THEN RETURN false; END IF;

  EXECUTE FORMAT(
    'SELECT %I FROM public.user_permissions up
     JOIN public.users u ON u.id = up.user_id
     WHERE u.auth_user_id = auth.uid()
       AND up.module_key ILIKE $1
       AND up.business_id = public.get_user_business_id()
     LIMIT 1',
    v_perm_column
  ) INTO v_has_perm USING p_module;

  RETURN COALESCE(v_has_perm, false);
END;
$$;

-- 5. Fix Search Path for Multi-Tenancy Scoping Trigger
CREATE OR REPLACE FUNCTION public.set_business_id_from_context()
RETURNS trigger AS $$
BEGIN
  BEGIN
    IF NEW.business_id IS NOT NULL THEN
       RETURN NEW;
    END IF;
  EXCEPTION WHEN undefined_column THEN
    RETURN NEW;
  END;

  -- Try lookup from related records first to ensure absolute tenant accuracy
  IF TG_TABLE_NAME = 'user_permissions' OR TG_TABLE_NAME = 'user_locations' THEN
     SELECT u.business_id INTO NEW.business_id FROM public.users u WHERE u.id = NEW.user_id;
  ELSIF TG_TABLE_NAME = 'products' THEN
     IF NEW.category_id IS NOT NULL THEN
        SELECT c.business_id INTO NEW.business_id FROM public.categories c WHERE c.id = NEW.category_id;
     END IF;
  ELSIF TG_TABLE_NAME = 'sale_items' THEN
     SELECT s.business_id INTO NEW.business_id FROM public.sales s WHERE s.id = NEW.sale_id;
  ELSIF TG_TABLE_NAME = 'purchase_items' THEN
     SELECT p.business_id INTO NEW.business_id FROM public.purchases p WHERE p.id = NEW.purchase_id;
  END IF;

  -- Fallback to session context if still null
  IF NEW.business_id IS NULL THEN
     NEW.business_id := public.get_user_business_id();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

-- 6. Fix Search Path for New User Trigger
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
BEGIN
  v_business_id := COALESCE(
    NULLIF(NEW.raw_app_meta_data ->> 'business_id', ''),
    NULLIF(NEW.raw_user_meta_data ->> 'business_id', '')
  )::uuid;

  v_role := COALESCE(
    NULLIF(NEW.raw_app_meta_data ->> 'role', ''),
    'admin'
  )::public.app_role;

  IF v_business_id IS NULL THEN
    v_business_name := COALESCE(NEW.raw_user_meta_data ->> 'business_name', 'My Business');
    
    INSERT INTO public.businesses (name, owner_auth_user_id)
    VALUES (v_business_name, NEW.id)
    RETURNING id INTO v_business_id;

    INSERT INTO public.shop_settings (business_id, shop_name)
    VALUES (v_business_id, v_business_name);
  END IF;

  INSERT INTO public.users (auth_user_id, business_id, email, full_name, role)
  VALUES (
    NEW.id,
    v_business_id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email),
    v_role
  );

  RETURN NEW;
END;
$$;
