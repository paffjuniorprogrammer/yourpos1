-- Fix set_business_id_from_context trigger function to prevent record "new" has no field "category_id" error when inserting into tables without category_id (e.g., locations)

CREATE OR REPLACE FUNCTION public.set_business_id_from_context()
RETURNS trigger AS $$
BEGIN
  -- 1. If business_id is already set, just return
  BEGIN
    IF NEW.business_id IS NOT NULL THEN
       RETURN NEW;
    END IF;
  EXCEPTION WHEN undefined_column THEN
    RETURN NEW; -- Table doesn't have business_id, skip scoping
  END;

  -- 2. Try lookup from related records first to ensure absolute tenant accuracy
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

  -- 3. Fallback to session context (for tenant users) if still null
  IF NEW.business_id IS NULL THEN
     NEW.business_id := public.get_user_business_id();
  END IF;

  -- Final validation (only for tables that should have it)
  IF NEW.business_id IS NULL AND TG_TABLE_NAME NOT IN ('businesses', 'subscription_plans', 'platform_admins') THEN
     RAISE EXCEPTION 'business_id is required for multi-tenant isolation on table %', TG_TABLE_NAME;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;
