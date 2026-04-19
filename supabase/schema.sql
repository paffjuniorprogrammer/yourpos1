create extension if not exists "pgcrypto";

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')) THEN
        CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'cashier');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_method' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')) THEN
        CREATE TYPE public.payment_method AS ENUM ('cash', 'momo', 'card', 'bank', 'credit');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')) THEN
        CREATE TYPE public.payment_status AS ENUM ('paid', 'unpaid', 'partial');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'stock_movement_type' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')) THEN
        CREATE TYPE public.stock_movement_type AS ENUM ('in', 'out', 'transfer', 'count');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transfer_status' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')) THEN
        CREATE TYPE public.transfer_status AS ENUM ('pending', 'in_transit', 'completed');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'adjustment_type' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')) THEN
        CREATE TYPE public.adjustment_type AS ENUM ('add', 'subtract');
    END IF;
END $$;

-- Subscription Tiers
create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  price numeric(12,2) not null default 0,
  max_users integer,
  max_locations integer,
  features jsonb default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Seed default plans
insert into public.subscription_plans (name, price, max_users, max_locations, features)
values 
  ('Starter', 10000, 3, 1, '["Basic POS", "Inventory Management"]'),
  ('Professional', 25000, 10, 3, '["Advanced Analytics", "Supplier Management", "Stock Transfers"]'),
  ('Enterprise', 50000, null, null, '["Multi-location Sync", "Custom Branding", "Priority Support"]')
on conflict do nothing;

-- Multi-tenant root: businesses (tenants)
create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_auth_user_id uuid,
  plan_id uuid references public.subscription_plans(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'expired', 'suspended')),
  subscription_start_date timestamptz default now(),
  subscription_end_date timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Migration for existing businesses
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES public.subscription_plans(id) ON DELETE SET NULL;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'suspended'));
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS subscription_start_date timestamptz DEFAULT now();
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS subscription_end_date timestamptz;


-- Platform-level super admins (not tied to a single business's data access)
create table if not exists public.platform_admins (
  auth_user_id uuid primary key,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  auth_user_id uuid unique,
  full_name text not null,
  email text not null,
  role public.app_role not null default 'cashier',
  location_id uuid references public.locations(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Add business_id columns for existing databases
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES public.businesses(id) ON DELETE RESTRICT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES public.businesses(id) ON DELETE RESTRICT;

-- Add location_id to existing users if the column was not created yet
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL;

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES public.businesses(id) ON DELETE RESTRICT;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  full_name text not null,
  phone text,
  email text,
  address text,
  created_at timestamptz not null default now()
);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  name text not null,
  contact_name text,
  phone text,
  email text,
  address text,
  tin_number text,
  payment_term text,
  bank_account text,
  created_at timestamptz not null default now()
);

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES public.businesses(id) ON DELETE RESTRICT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES public.businesses(id) ON DELETE RESTRICT;

create table if not exists public.user_locations (
  user_id uuid not null references public.users(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  business_id uuid references public.businesses(id) on delete restrict,
  primary key (user_id, location_id)
);
ALTER TABLE public.user_locations ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES public.businesses(id) ON DELETE RESTRICT;
-- Note: RLS policies + migration insert for user_locations are defined later,
-- after helper functions (public.get_user_business_id / public.get_user_role) exist.

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  category_id uuid references public.categories(id) on delete set null,
  name text not null,
  barcode text,
  cost_price numeric(12,2) not null default 0,
  selling_price numeric(12,2) not null,
  stock_quantity integer not null default 0,
  reorder_level integer not null default 5,
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.product_stocks (
  business_id uuid not null references public.businesses(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  quantity integer not null default 0,
  primary key (product_id, location_id)
);

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES public.businesses(id) ON DELETE RESTRICT;
ALTER TABLE public.product_stocks ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES public.businesses(id) ON DELETE RESTRICT;

-- Add location_id safeguard
ALTER TABLE public.product_stocks ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.locations(id) ON DELETE CASCADE;

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  sale_number text not null,
  customer_id uuid references public.customers(id) on delete set null,
  cashier_id uuid not null references public.users(id) on delete restrict,
  location_id uuid references public.locations(id) on delete restrict,
  subtotal numeric(12,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  payment_method public.payment_method,
  payment_status public.payment_status not null default 'paid',
  notes text,
  created_at timestamptz not null default now()
);

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES public.businesses(id) ON DELETE RESTRICT;

-- Add location_id to existing sales if it doesn't exist
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.locations(id) ON DELETE RESTRICT;

create table if not exists public.shop_settings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  shop_name text not null default '',
  logo_url text,
  address text,
  contact_phone text,
  contact_email text,
  currency_code text not null default 'RWF',
  default_profit_percentage numeric(5,2) not null default 30,
  tax_percentage numeric(5,2) not null default 18,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

ALTER TABLE public.shop_settings ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES public.businesses(id) ON DELETE RESTRICT;

create table if not exists public.user_permissions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  user_id uuid not null references public.users(id) on delete cascade,
  module_key text not null,
  can_view boolean not null default false,
  can_add boolean not null default false,
  can_edit boolean not null default false,
  can_delete boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, module_key)
);

ALTER TABLE public.user_permissions ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES public.businesses(id) ON DELETE RESTRICT;

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null,
  line_total numeric(12,2) not null
);

ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES public.businesses(id) ON DELETE RESTRICT;

create table if not exists public.sale_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  sale_id uuid not null references public.sales(id) on delete cascade,
  payment_method public.payment_method not null,
  amount numeric(12,2) not null check (amount >= 0),
  reference text,
  notes text,
  paid_at timestamptz not null default now()
);

ALTER TABLE public.sale_payments ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES public.businesses(id) ON DELETE RESTRICT;

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  user_id uuid references public.users(id) on delete set null,
  location_id uuid references public.locations(id) on delete restrict,
  total_cost numeric(12,2) not null default 0,
  payment_status public.payment_status not null default 'unpaid',
  delivery_status text not null default 'pending',
  purchase_date timestamptz not null default now(),
  notes text
);

ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES public.businesses(id) ON DELETE RESTRICT;

-- Add location_id column if it doesn't exist (for existing tables)
ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.locations(id) ON DELETE RESTRICT;

create table if not exists public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  cost_price numeric(12,2) not null,
  line_total numeric(12,2) not null
);

ALTER TABLE public.purchase_items ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES public.businesses(id) ON DELETE RESTRICT;

create table if not exists public.purchase_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  payment_method public.payment_method not null,
  amount numeric(12,2) not null check (amount >= 0),
  reference text,
  notes text,
  paid_at timestamptz not null default now()
);

ALTER TABLE public.purchase_payments ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES public.businesses(id) ON DELETE RESTRICT;

create table if not exists public.customer_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete cascade,
  sale_id uuid references public.sales(id) on delete set null,
  received_by uuid references public.users(id) on delete set null,
  payment_method public.payment_method not null,
  amount numeric(12,2) not null check (amount > 0),
  notes text,
  paid_at timestamptz not null default now()
);

ALTER TABLE public.customer_payments ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES public.businesses(id) ON DELETE RESTRICT;
create table if not exists public.stock_counts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  stock_name text not null,
  location_id uuid not null references public.locations(id) on delete restrict,
  created_by uuid references public.users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  count_number bigint generated always as identity (start with 1001)
);

ALTER TABLE public.stock_counts ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES public.businesses(id) ON DELETE RESTRICT;

-- Add location_id safeguard
ALTER TABLE public.stock_counts ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.locations(id) ON DELETE RESTRICT;

create table if not exists public.stock_count_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  stock_count_id uuid not null references public.stock_counts(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  system_quantity integer not null default 0,
  adjustment_mode public.adjustment_type not null,
  counted_quantity integer not null check (counted_quantity >= 0),
  final_quantity integer not null default 0
);

ALTER TABLE public.stock_count_items ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES public.businesses(id) ON DELETE RESTRICT;

create table if not exists public.stock_transfers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  from_location_id uuid not null references public.locations(id) on delete restrict,
  to_location_id uuid not null references public.locations(id) on delete restrict,
  status public.transfer_status not null default 'pending',
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  transfer_number bigint generated always as identity (start with 1001)
);

ALTER TABLE public.stock_transfers ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES public.businesses(id) ON DELETE RESTRICT;

create table if not exists public.stock_transfer_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  stock_transfer_id uuid not null references public.stock_transfers(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  available_quantity integer not null default 0,
  transfer_quantity integer not null check (transfer_quantity > 0)
);

ALTER TABLE public.stock_transfer_items ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES public.businesses(id) ON DELETE RESTRICT;

create table if not exists public.day_closures (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  user_id uuid references public.users(id) on delete set null,
  location_id uuid references public.locations(id) on delete restrict,
  closing_date date not null,
  cash_amount decimal(12,2) not null default 0,
  momo_amount decimal(12,2) not null default 0,
  bank_amount decimal(12,2) not null default 0,
  card_amount decimal(12,2) not null default 0,
  credit_amount decimal(12,2) not null default 0,
  total_amount decimal(12,2) not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, closing_date, location_id)
);

ALTER TABLE public.day_closures ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES public.businesses(id) ON DELETE RESTRICT;

-- Add location_id safeguard
ALTER TABLE public.day_closures ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL;

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  user_id uuid references public.users(id) on delete set null,
  movement_type public.stock_movement_type not null,
  quantity integer not null,
  location_id uuid references public.locations(id) on delete restrict,
  destination_location_id uuid references public.locations(id) on delete restrict,
  transfer_status public.transfer_status,
  reference_type text,
  reference_id uuid,
  created_at timestamptz not null default now()
);

ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES public.businesses(id) ON DELETE RESTRICT;

-- Safeguard: ensure location_id exists even if table was created with old schema
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.locations(id) ON DELETE RESTRICT;

create index if not exists idx_products_category_id on public.products(category_id);
create index if not exists idx_products_barcode on public.products(barcode);
create index if not exists idx_sales_customer_id on public.sales(customer_id);
create index if not exists idx_sales_cashier_id on public.sales(cashier_id);
create index if not exists idx_sales_location_id on public.sales(location_id);
create index if not exists idx_sale_items_sale_id on public.sale_items(sale_id);
create index if not exists idx_purchases_supplier_id on public.purchases(supplier_id);
create index if not exists idx_purchases_location_id on public.purchases(location_id);
create index if not exists idx_stock_movements_product_id on public.stock_movements(product_id);
create index if not exists idx_sale_payments_sale_id on public.sale_payments(sale_id);
create index if not exists idx_purchase_payments_purchase_id on public.purchase_payments(purchase_id);
create index if not exists idx_customer_payments_customer_id on public.customer_payments(customer_id);
create index if not exists idx_stock_counts_created_by on public.stock_counts(created_by);
create index if not exists idx_stock_transfers_created_by on public.stock_transfers(created_by);
create index if not exists idx_day_closures_user_id on public.day_closures(user_id);

-- Drop legacy global-unique constraints so uniqueness can be scoped per business
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'locations'
      AND c.contype = 'u'
      AND pg_get_constraintdef(c.oid) = 'UNIQUE (name)'
  LOOP
    EXECUTE format('ALTER TABLE public.locations DROP CONSTRAINT %I', r.conname);
  END LOOP;

  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'users'
      AND c.contype = 'u'
      AND pg_get_constraintdef(c.oid) = 'UNIQUE (email)'
  LOOP
    EXECUTE format('ALTER TABLE public.users DROP CONSTRAINT %I', r.conname);
  END LOOP;

  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'categories'
      AND c.contype = 'u'
      AND pg_get_constraintdef(c.oid) = 'UNIQUE (name)'
  LOOP
    EXECUTE format('ALTER TABLE public.categories DROP CONSTRAINT %I', r.conname);
  END LOOP;

  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'products'
      AND c.contype = 'u'
      AND pg_get_constraintdef(c.oid) = 'UNIQUE (barcode)'
  LOOP
    EXECUTE format('ALTER TABLE public.products DROP CONSTRAINT %I', r.conname);
  END LOOP;

  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'sales'
      AND c.contype = 'u'
      AND pg_get_constraintdef(c.oid) = 'UNIQUE (sale_number)'
  LOOP
    EXECUTE format('ALTER TABLE public.sales DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

-- Multi-tenant unique indexes (scoped per business)
create unique index if not exists uq_locations_business_name on public.locations(business_id, name);
create unique index if not exists uq_users_business_email on public.users(business_id, email);
create unique index if not exists uq_categories_business_name on public.categories(business_id, name);
create unique index if not exists uq_products_business_barcode on public.products(business_id, barcode) where barcode is not null and barcode <> '';
create unique index if not exists uq_sales_business_sale_number on public.sales(business_id, sale_number);
create unique index if not exists uq_shop_settings_business on public.shop_settings(business_id);

create or replace function public.is_platform_admin()
returns boolean
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  return exists (
    select 1
    from public.platform_admins pa
    where pa.auth_user_id = auth.uid()
      and pa.is_active = true
  );
end;
$$;

create or replace function public.has_module_permission(p_module text, p_action text)
returns boolean
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_perm_column text;
  v_has_perm boolean;
begin
  if public.is_platform_admin() then return true; end if;
  
  -- Admins have all permissions within their business
  if public.get_user_role() = 'admin' then return true; end if;

  v_perm_column := case lower(p_action)
    when 'view' then 'can_view'
    when 'add' then 'can_add'
    when 'edit' then 'can_edit'
    when 'delete' then 'can_delete'
    else null
  end;

  if v_perm_column is null then return false; end if;

  execute format(
    'select %I from public.user_permissions up
     join public.users u on u.id = up.user_id
     where u.auth_user_id = auth.uid()
       and up.module_key ilike $1
       and up.business_id = public.get_user_business_id()
     limit 1',
    v_perm_column
  ) into v_has_perm using p_module;

  return coalesce(v_has_perm, false);
end;
$$;

create or replace function public.get_user_role()
returns public.app_role
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_role public.app_role;
begin
  if public.is_platform_admin() then
    return 'admin'::public.app_role;
  end if;

  select role into v_role
  from public.users
  where auth_user_id = auth.uid()
    and is_active = true
  limit 1;
  return coalesce(v_role, 'cashier'::public.app_role);
end;
$$;

create or replace function public.get_user_business_id()
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_business_id uuid;
begin
  select business_id into v_business_id
  from public.users
  where auth_user_id = auth.uid()
    and is_active = true
  limit 1;
  return v_business_id;
end;
$$;

-- AUTOMATIC BUSINESS SCOPING TRIGGER
CREATE OR REPLACE FUNCTION public.set_business_id_from_context()
RETURNS trigger AS $$
BEGIN
  -- 1. If business_id is already set, just return
  -- We use a dynamic check here to avoid "no field business_id" errors on tables that don't have it
  BEGIN
    IF NEW.business_id IS NOT NULL THEN
       RETURN NEW;
    END IF;
  EXCEPTION WHEN undefined_column THEN
    RETURN NEW; -- Table doesn't have business_id, skip scoping
  END;

  -- 2. Try session context (for tenant users)
  NEW.business_id := public.get_user_business_id();
  
  -- 3. If still null (e.g. Super Admin), try lookup from related records
  IF NEW.business_id IS NULL THEN
    IF TG_TABLE_NAME = 'user_permissions' OR TG_TABLE_NAME = 'user_locations' THEN
       SELECT u.business_id INTO NEW.business_id FROM public.users u WHERE u.id = NEW.user_id;
    ELSIF TG_TABLE_NAME = 'products' AND NEW.category_id IS NOT NULL THEN
       SELECT c.business_id INTO NEW.business_id FROM public.categories c WHERE c.id = NEW.category_id;
    ELSIF TG_TABLE_NAME = 'sale_items' THEN
       SELECT s.business_id INTO NEW.business_id FROM public.sales s WHERE s.id = NEW.sale_id;
    ELSIF TG_TABLE_NAME = 'purchase_items' THEN
       SELECT p.business_id INTO NEW.business_id FROM public.purchases p WHERE p.id = NEW.purchase_id;
    END IF;
  END IF;

  -- Final validation (only for tables that should have it)
  IF NEW.business_id IS NULL AND TG_TABLE_NAME NOT IN ('businesses', 'subscription_plans', 'platform_admins') THEN
     -- Silently fail or log rather than crash? For now, we keep it as a requirement.
     -- RAISE EXCEPTION 'business_id is required for multi-tenancy in table %', TG_TABLE_NAME;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach Triggers
DROP TRIGGER IF EXISTS trg_set_business_id_permissions ON public.user_permissions;
CREATE TRIGGER trg_set_business_id_permissions BEFORE INSERT ON public.user_permissions FOR EACH ROW EXECUTE FUNCTION public.set_business_id_from_context();

DROP TRIGGER IF EXISTS trg_set_business_id_user_locations ON public.user_locations;
CREATE TRIGGER trg_set_business_id_user_locations BEFORE INSERT ON public.user_locations FOR EACH ROW EXECUTE FUNCTION public.set_business_id_from_context();

DROP TRIGGER IF EXISTS trg_set_business_id_categories ON public.categories;
CREATE TRIGGER trg_set_business_id_categories BEFORE INSERT ON public.categories FOR EACH ROW EXECUTE FUNCTION public.set_business_id_from_context();

DROP TRIGGER IF EXISTS trg_set_business_id_products ON public.products;
CREATE TRIGGER trg_set_business_id_products BEFORE INSERT ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_business_id_from_context();

DROP TRIGGER IF EXISTS trg_set_business_id_customers ON public.customers;
CREATE TRIGGER trg_set_business_id_customers BEFORE INSERT ON public.customers FOR EACH ROW EXECUTE FUNCTION public.set_business_id_from_context();

DROP TRIGGER IF EXISTS trg_set_business_id_suppliers ON public.suppliers;
CREATE TRIGGER trg_set_business_id_suppliers BEFORE INSERT ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.set_business_id_from_context();

DROP TRIGGER IF EXISTS trg_set_business_id_sales ON public.sales;
CREATE TRIGGER trg_set_business_id_sales BEFORE INSERT ON public.sales FOR EACH ROW EXECUTE FUNCTION public.set_business_id_from_context();

DROP TRIGGER IF EXISTS trg_set_business_id_sale_items ON public.sale_items;
CREATE TRIGGER trg_set_business_id_sale_items BEFORE INSERT ON public.sale_items FOR EACH ROW EXECUTE FUNCTION public.set_business_id_from_context();

DROP TRIGGER IF EXISTS trg_set_business_id_sale_payments ON public.sale_payments;
CREATE TRIGGER trg_set_business_id_sale_payments BEFORE INSERT ON public.sale_payments FOR EACH ROW EXECUTE FUNCTION public.set_business_id_from_context();

DROP TRIGGER IF EXISTS trg_set_business_id_purchases ON public.purchases;
CREATE TRIGGER trg_set_business_id_purchases BEFORE INSERT ON public.purchases FOR EACH ROW EXECUTE FUNCTION public.set_business_id_from_context();

DROP TRIGGER IF EXISTS trg_set_business_id_purchase_items ON public.purchase_items;
CREATE TRIGGER trg_set_business_id_purchase_items BEFORE INSERT ON public.purchase_items FOR EACH ROW EXECUTE FUNCTION public.set_business_id_from_context();

DROP TRIGGER IF EXISTS trg_set_business_id_purchase_payments ON public.purchase_payments;
CREATE TRIGGER trg_set_business_id_purchase_payments BEFORE INSERT ON public.purchase_payments FOR EACH ROW EXECUTE FUNCTION public.set_business_id_from_context();

DROP TRIGGER IF EXISTS trg_set_business_id_customer_payments ON public.customer_payments;
CREATE TRIGGER trg_set_business_id_customer_payments BEFORE INSERT ON public.customer_payments FOR EACH ROW EXECUTE FUNCTION public.set_business_id_from_context();

DROP TRIGGER IF EXISTS trg_set_business_id_locations ON public.locations;
CREATE TRIGGER trg_set_business_id_locations BEFORE INSERT ON public.locations FOR EACH ROW EXECUTE FUNCTION public.set_business_id_from_context();

DROP TRIGGER IF EXISTS trg_set_business_id_shop_settings ON public.shop_settings;
CREATE TRIGGER trg_set_business_id_shop_settings BEFORE INSERT ON public.shop_settings FOR EACH ROW EXECUTE FUNCTION public.set_business_id_from_context();

DROP TRIGGER IF EXISTS trg_set_business_id_stock_movements ON public.stock_movements;
CREATE TRIGGER trg_set_business_id_stock_movements BEFORE INSERT ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION public.set_business_id_from_context();

DROP TRIGGER IF EXISTS trg_set_business_id_stock_counts ON public.stock_counts;
CREATE TRIGGER trg_set_business_id_stock_counts BEFORE INSERT ON public.stock_counts FOR EACH ROW EXECUTE FUNCTION public.set_business_id_from_context();

DROP TRIGGER IF EXISTS trg_set_business_id_stock_count_items ON public.stock_count_items;
CREATE TRIGGER trg_set_business_id_stock_count_items BEFORE INSERT ON public.stock_count_items FOR EACH ROW EXECUTE FUNCTION public.set_business_id_from_context();

DROP TRIGGER IF EXISTS trg_set_business_id_stock_transfers ON public.stock_transfers;
CREATE TRIGGER trg_set_business_id_stock_transfers BEFORE INSERT ON public.stock_transfers FOR EACH ROW EXECUTE FUNCTION public.set_business_id_from_context();

DROP TRIGGER IF EXISTS trg_set_business_id_stock_transfer_items ON public.stock_transfer_items;
CREATE TRIGGER trg_set_business_id_stock_transfer_items BEFORE INSERT ON public.stock_transfer_items FOR EACH ROW EXECUTE FUNCTION public.set_business_id_from_context();

DROP TRIGGER IF EXISTS trg_set_business_id_day_closures ON public.day_closures;
CREATE TRIGGER trg_set_business_id_day_closures BEFORE INSERT ON public.day_closures FOR EACH ROW EXECUTE FUNCTION public.set_business_id_from_context();

DROP TRIGGER IF EXISTS trg_set_business_id_cash_registers ON public.cash_registers;
CREATE TRIGGER trg_set_business_id_cash_registers BEFORE INSERT ON public.cash_registers FOR EACH ROW EXECUTE FUNCTION public.set_business_id_from_context();

create or replace function public.get_user_location()
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_location_id uuid;
  v_has_column boolean;
begin
  select exists(
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'users'
      and column_name = 'location_id'
  ) into v_has_column;

  if not v_has_column then
    return null;
  end if;

  execute 'select location_id from public.users where auth_user_id = auth.uid() and is_active = true limit 1'
    into v_location_id;
  return v_location_id;
end;
$$;

-- User Locations (Staff Assignments)
drop policy if exists "Authenticated staff read user_locations" on public.user_locations;
create policy "Authenticated staff read user_locations"
on public.user_locations
for select
using (
  public.is_platform_admin()
  or business_id = public.get_user_business_id()
);

drop policy if exists "Admins manage user_locations" on public.user_locations;
create policy "Admins manage user_locations"
on public.user_locations
for all
using (
  public.is_platform_admin()
  or (public.get_user_role() = 'admin' and business_id = public.get_user_business_id())
)
with check (
  public.is_platform_admin()
  or (public.get_user_role() = 'admin' and business_id = public.get_user_business_id())
);

-- Initial migration: Move existing user assignments to the new table
insert into public.user_locations (user_id, location_id)
select id, location_id from public.users
where location_id is not null
on conflict do nothing;

create or replace function public.current_app_role()
returns public.app_role
language sql
security definer
set row_security = off
stable
as $$
  select public.get_user_role();
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_business_id uuid;
  v_business_name text;
  v_role public.app_role;
  v_role_meta text;
begin
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

    v_role := 'admin'::public.app_role;

    insert into public.locations (business_id, name)
    values (v_business_id, v_business_name)
    on conflict (business_id, name) do nothing;

    insert into public.shop_settings (business_id, shop_name)
    values (v_business_id, v_business_name)
    on conflict (business_id) do nothing;
  else
    -- 2. This is an invited user or staff member for an EXISTING business
    if v_role_meta = 'super_admin' then
      insert into public.platform_admins (auth_user_id)
      values (new.id)
      on conflict (auth_user_id) do nothing;
      v_role := 'admin'::public.app_role;
    elsif v_role_meta in ('admin', 'manager', 'cashier', 'casher') then
      v_role := (case when v_role_meta = 'casher' then 'cashier' else v_role_meta end)::public.app_role;
    else
      v_role := 'cashier'::public.app_role;
    end if;
  end if;

  insert into public.users (auth_user_id, business_id, full_name, email, role)
  values (
    new.id,
    v_business_id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.email,
    v_role
  )
  on conflict (auth_user_id) do update
  set
    business_id = coalesce(public.users.business_id, excluded.business_id),
    full_name = excluded.full_name,
    email = excluded.email;

  return new;
end;
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.generate_sale_number()
returns text
language plpgsql
as $$
declare
  next_number bigint;
begin
  select coalesce(count(*), 0) + 1
  into next_number
  from public.sales
  where created_at::date = current_date
    and business_id = public.get_user_business_id();

  return 'INV-' || to_char(current_date, 'YYYYMMDD') || '-' || lpad(next_number::text, 4, '0');
end;
$$;

create or replace function public.create_sale_transaction(
  p_sale_number text,
  p_customer_id uuid,
  p_cashier_id uuid,
  p_subtotal numeric,
  p_tax_amount numeric,
  p_total_amount numeric,
  p_payment_method public.payment_method,
  p_payment_status public.payment_status,
  p_notes text,
  p_location_id uuid,
  p_items jsonb,
  p_payments jsonb default '[]'::jsonb,
  p_discount_amount numeric default 0,
  p_discount_type text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale_id uuid;
  v_item jsonb;
  v_payment jsonb;
  v_product_id uuid;
  v_quantity integer;
  v_unit_price numeric(12,2);
  v_line_total numeric(12,2);
  v_sale_number text := p_sale_number;
  v_assigned_location_id uuid := p_location_id;
  v_business_id uuid;
begin
  -- If location not provided, try to get user default or first available
  if v_assigned_location_id is null then
    select location_id into v_assigned_location_id from public.users where id = p_cashier_id;
  end if;
  
  if v_assigned_location_id is null then
    select id into v_assigned_location_id from public.locations order by created_at asc limit 1;
  end if;

  -- Determine business (tenant) for the sale
  select business_id into v_business_id
  from public.users
  where id = p_cashier_id;

  if v_business_id is null and v_assigned_location_id is not null then
    select business_id into v_business_id
    from public.locations
    where id = v_assigned_location_id;
  end if;

  if v_business_id is null then
    raise exception 'Cannot determine business_id for sale (cashier_id=%)', p_cashier_id;
  end if;

  -- Generate sale number if not provided
  if v_sale_number is null or v_sale_number = '' then
    v_sale_number := public.generate_sale_number();
  end if;

  insert into public.sales (
    business_id, sale_number, customer_id, cashier_id, location_id, 
    subtotal, tax_amount, total_amount, payment_method, payment_status, 
    notes, discount_amount, discount_type
  ) values (
    v_business_id, v_sale_number, p_customer_id, p_cashier_id, v_assigned_location_id, 
    p_subtotal, p_tax_amount, p_total_amount, p_payment_method, p_payment_status, 
    nullif(p_notes, ''), p_discount_amount, p_discount_type
  ) returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item ->> 'product_id')::uuid;
    v_quantity := (v_item ->> 'quantity')::integer;
    v_unit_price := (v_item ->> 'unit_price')::numeric(12,2);
    v_line_total := (v_item ->> 'line_total')::numeric(12,2);

    insert into public.sale_items (
      business_id, sale_id, product_id, quantity, unit_price, line_total,
      discount_amount, discount_type
    )
    values (
      v_business_id, 
      v_sale_id, 
      v_product_id, 
      v_quantity, 
      v_unit_price, 
      v_line_total,
      coalesce((v_item ->> 'discount_amount')::numeric(12,2), 0),
      v_item ->> 'discount_type'
    );

    update public.products
    set stock_quantity = stock_quantity - v_quantity
    where id = v_product_id
      and business_id = v_business_id;

    if v_assigned_location_id is not null then
      insert into public.product_stocks (business_id, product_id, location_id, quantity)
      values (v_business_id, v_product_id, v_assigned_location_id, -v_quantity)
      on conflict (product_id, location_id)
      do update set quantity = public.product_stocks.quantity - v_quantity;
    end if;

    insert into public.stock_movements (
      business_id, product_id, user_id, movement_type, quantity, location_id, reference_type, reference_id
    ) values (
      v_business_id, v_product_id, p_cashier_id, 'out', v_quantity, v_assigned_location_id, 'sale', v_sale_id
    );
  end loop;

  for v_payment in select * from jsonb_array_elements(p_payments)
  loop
    insert into public.sale_payments (business_id, sale_id, payment_method, amount, reference, notes)
    values (
      v_business_id,
      v_sale_id,
      (v_payment ->> 'payment_method')::public.payment_method,
      coalesce((v_payment ->> 'amount')::numeric(12,2), 0),
      nullif(v_payment ->> 'reference', ''),
      nullif(v_payment ->> 'notes', '')
    );
  end loop;

  return v_sale_id;
end;
$$;

create or replace function public.delete_sale_transaction(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
  v_found_location_id uuid;
  v_business_id uuid;
begin
  select location_id, business_id
  into v_found_location_id, v_business_id
  from public.sales
  where id = p_sale_id;

  if v_found_location_id is null then
    select location_id, business_id
    into v_found_location_id, v_business_id
    from public.users
    where auth_user_id = auth.uid();
  end if;

  if v_found_location_id is null then
    select id, business_id
    into v_found_location_id, v_business_id
    from public.locations
    order by created_at asc
    limit 1;
  end if;

  -- Restore stock before deleting
  for v_item in select product_id, quantity from public.sale_items where sale_id = p_sale_id loop
    update public.products
    set stock_quantity = stock_quantity + v_item.quantity
    where id = v_item.product_id
      and business_id = v_business_id;

    if v_found_location_id is not null then
      insert into public.product_stocks (business_id, product_id, location_id, quantity)
      values (v_business_id, v_item.product_id, v_found_location_id, v_item.quantity)
      on conflict (product_id, location_id)
      do update set quantity = public.product_stocks.quantity + v_item.quantity;
    end if;

    -- Log stock restoration
    insert into public.stock_movements (business_id, product_id, movement_type, quantity, destination_location_id, reference_type, reference_id)
    values (v_business_id, v_item.product_id, 'in', v_item.quantity, v_found_location_id, 'sale_return', p_sale_id);
  end loop;

  delete from public.sales where id = p_sale_id;
end;
$$;

create or replace function public.record_sale_payment(
  p_sale_id uuid,
  p_payment_method public.payment_method,
  p_amount numeric,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_paid numeric;
  v_total_amount numeric;
  v_business_id uuid;
begin
  select business_id into v_business_id
  from public.sales
  where id = p_sale_id;

  -- Record the payment
  insert into public.sale_payments (business_id, sale_id, payment_method, amount, notes)
  values (v_business_id, p_sale_id, p_payment_method, p_amount, p_notes);

  -- Calculate new total paid
  select coalesce(sum(amount), 0) into v_total_paid
  from public.sale_payments
  where sale_id = p_sale_id;

  -- Get total sale amount
  select total_amount into v_total_amount
  from public.sales
  where id = p_sale_id;

  -- Update sale status
  if v_total_paid >= v_total_amount then
    update public.sales set payment_status = 'paid' where id = p_sale_id;
  elsif v_total_paid > 0 then
    update public.sales set payment_status = 'partial' where id = p_sale_id;
  end if;
end;
$$;

create or replace function public.update_sale_transaction(
  p_sale_id uuid,
  p_subtotal numeric,
  p_tax_amount numeric,
  p_total_amount numeric,
  p_items jsonb,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
  v_new_item jsonb;
  v_location_id uuid;
  v_cashier_id uuid;
  v_business_id uuid;
begin
  -- Get the cashier and their location
  select cashier_id into v_cashier_id from public.sales where id = p_sale_id;
  select location_id into v_location_id from public.users where id = v_cashier_id;
  select business_id into v_business_id from public.sales where id = p_sale_id;
  
  if v_location_id is null then
    select id into v_location_id from public.locations order by created_at asc limit 1;
  end if;

  -- 1. Restore stock from OLD items
  for v_item in select product_id, quantity from public.sale_items where sale_id = p_sale_id loop
    update public.products
    set stock_quantity = stock_quantity + v_item.quantity
    where id = v_item.product_id
      and business_id = v_business_id;

    if v_location_id is not null then
      insert into public.product_stocks (business_id, product_id, location_id, quantity)
      values (v_business_id, v_item.product_id, v_location_id, v_item.quantity)
      on conflict (product_id, location_id)
      do update set quantity = public.product_stocks.quantity + v_item.quantity;
    end if;
  end loop;

  -- 2. Clear OLD items
  delete from public.sale_items where sale_id = p_sale_id;

  -- 3. Insert NEW items and subtract stock
  for v_new_item in select * from jsonb_array_elements(p_items) loop
    insert into public.sale_items (business_id, sale_id, product_id, quantity, unit_price, line_total)
    values (
      v_business_id,
      p_sale_id,
      (v_new_item ->> 'product_id')::uuid,
      (v_new_item ->> 'quantity')::integer,
      (v_new_item ->> 'unit_price')::numeric(12,2),
      (v_new_item ->> 'line_total')::numeric(12,2)
    );

    update public.products
    set stock_quantity = stock_quantity - (v_new_item ->> 'quantity')::integer
    where id = (v_new_item ->> 'product_id')::uuid
      and business_id = v_business_id;

    if v_location_id is not null then
      insert into public.product_stocks (business_id, product_id, location_id, quantity)
      values (v_business_id, (v_new_item ->> 'product_id')::uuid, v_location_id, -(v_new_item ->> 'quantity')::integer)
      on conflict (product_id, location_id)
      do update set quantity = public.product_stocks.quantity - (v_new_item ->> 'quantity')::integer;
    end if;

    insert into public.stock_movements (
      business_id, product_id, user_id, movement_type, quantity, location_id, reference_type, reference_id
    ) values (
      v_business_id, (v_new_item ->> 'product_id')::uuid, v_cashier_id, 'out', (v_new_item ->> 'quantity')::integer, v_location_id, 'sale_update', p_sale_id
    );
  end loop;

  -- 4. Update sale totals
  update public.sales
  set 
    subtotal = p_subtotal,
    tax_amount = p_tax_amount,
    total_amount = p_total_amount,
    notes = coalesce(p_notes, notes)
  where id = p_sale_id;
end;
$$;

-- Purchase transaction RPC
CREATE OR REPLACE FUNCTION public.create_purchase_transaction(
  p_supplier_id uuid,
  p_user_id uuid,
  p_location_id uuid,
  p_total_cost numeric,
  p_payment_status text,
  p_items jsonb,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purchase_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_quantity integer;
  v_cost_price numeric;
  v_selling_price numeric;
  v_business_id uuid;
BEGIN
  select business_id into v_business_id
  from public.locations
  where id = p_location_id;

  if v_business_id is null then
    select business_id into v_business_id
    from public.users
    where id = p_user_id;
  end if;

  if v_business_id is null then
    raise exception 'Cannot determine business_id for purchase (user_id=%, location_id=%)', p_user_id, p_location_id;
  end if;

  INSERT INTO public.purchases (business_id, supplier_id, user_id, location_id, total_cost, payment_status, notes)
  VALUES (v_business_id, p_supplier_id, p_user_id, p_location_id, p_total_cost, p_payment_status::public.payment_status, p_notes)
  RETURNING id INTO v_purchase_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id    := (v_item->>'product_id')::uuid;
    v_quantity      := (v_item->>'quantity')::integer;
    v_cost_price    := (v_item->>'cost_price')::numeric;
    v_selling_price := COALESCE(NULLIF(v_item->>'selling_price','')::numeric, 0);

    INSERT INTO public.purchase_items (business_id, purchase_id, product_id, quantity, cost_price, line_total)
    VALUES (v_business_id, v_purchase_id, v_product_id, v_quantity, v_cost_price, v_quantity * v_cost_price);

    -- Update location-specific stock
    INSERT INTO public.product_stocks (business_id, product_id, location_id, quantity)
    VALUES (v_business_id, v_product_id, p_location_id, v_quantity)
    ON CONFLICT (product_id, location_id)
    DO UPDATE SET quantity = public.product_stocks.quantity + EXCLUDED.quantity;

    -- Update global product stock total + prices
    UPDATE public.products
    SET
      stock_quantity = (SELECT COALESCE(SUM(quantity), 0) FROM public.product_stocks WHERE product_id = v_product_id),
      cost_price = v_cost_price,
      selling_price = CASE WHEN v_selling_price > 0 THEN v_selling_price ELSE selling_price END
    WHERE id = v_product_id
      and business_id = v_business_id;

    INSERT INTO public.stock_movements (business_id, product_id, user_id, movement_type, quantity, location_id, reference_type, reference_id)
    VALUES (v_business_id, v_product_id, p_user_id, 'in', v_quantity, p_location_id, 'purchase', v_purchase_id);
  END LOOP;

  RETURN v_purchase_id;
END;
$$;

-- New functions for processing stock actions
CREATE OR REPLACE FUNCTION public.process_stock_count(
  p_location_id uuid,
  p_created_by uuid,
  p_notes text,
  p_items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_system_qty integer;
  v_counted_qty integer;
  v_final_qty integer;
  v_diff integer;
  v_adjustment_mode public.adjustment_type;
  v_business_id uuid;
BEGIN
  select business_id into v_business_id
  from public.locations
  where id = p_location_id;

  if v_business_id is null then
    raise exception 'Cannot determine business_id for stock count (location_id=%)', p_location_id;
  end if;

  INSERT INTO public.stock_counts (
    business_id, stock_name, location_id, created_by, notes
  ) VALUES (
    v_business_id, 'Take - ' || TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI'), p_location_id, p_created_by, nullif(p_notes, '')
  ) RETURNING id INTO v_count_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item ->> 'product_id')::uuid;
    v_counted_qty := (v_item ->> 'counted_quantity')::integer;
    v_adjustment_mode := (v_item ->> 'adjustment_mode')::public.adjustment_type;
    
    -- Force read the exact system quantity currently mapped to prevent sync bugs
    SELECT quantity INTO v_system_qty FROM public.product_stocks WHERE product_id = v_product_id AND location_id = p_location_id;
    v_system_qty := COALESCE(v_system_qty, 0);

    IF v_adjustment_mode = 'add' THEN
      v_final_qty := v_system_qty + v_counted_qty;
      v_diff := v_counted_qty;
    ELSE
      v_final_qty := v_system_qty - v_counted_qty;
      v_diff := -v_counted_qty;
    END IF;

    INSERT INTO public.stock_count_items (
      business_id, stock_count_id, product_id, system_quantity, adjustment_mode, counted_quantity, final_quantity
    ) VALUES (
      v_business_id, v_count_id, v_product_id, v_system_qty, v_adjustment_mode, v_counted_qty, v_final_qty
    );

    INSERT INTO public.product_stocks (business_id, product_id, location_id, quantity)
    VALUES (v_business_id, v_product_id, p_location_id, v_final_qty)
    ON CONFLICT (product_id, location_id)
    DO UPDATE SET quantity = EXCLUDED.quantity;

    UPDATE public.products p
    SET stock_quantity = (
      SELECT COALESCE(SUM(quantity), 0) FROM public.product_stocks WHERE product_id = p.id
    )
    WHERE id = v_product_id
      and business_id = v_business_id;

    IF v_diff != 0 THEN
       INSERT INTO public.stock_movements (
        business_id, product_id, user_id, movement_type, quantity, location_id, reference_type, reference_id
      ) VALUES (
        v_business_id, v_product_id, p_created_by, 'count', v_diff, p_location_id, 'stock_count', v_count_id
      );
    END IF;
  END LOOP;

  RETURN v_count_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_stock_transfer_status(
  p_transfer_id uuid,
  p_new_status public.transfer_status,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_status public.transfer_status;
  v_item record;
  v_from_loc uuid;
  v_to_loc uuid;
  v_business_id uuid;
BEGIN
  SELECT business_id, status, from_location_id, to_location_id
  INTO v_business_id, v_old_status, v_from_loc, v_to_loc
  FROM public.stock_transfers
  WHERE id = p_transfer_id;

  IF p_new_status = 'completed' AND v_old_status != 'completed' THEN
    FOR v_item IN SELECT product_id, transfer_quantity FROM public.stock_transfer_items WHERE stock_transfer_id = p_transfer_id
    LOOP
      UPDATE public.product_stocks 
      SET quantity = quantity - v_item.transfer_quantity 
      WHERE product_id = v_item.product_id
        AND location_id = v_from_loc
        AND business_id = v_business_id;

      INSERT INTO public.product_stocks (business_id, product_id, location_id, quantity)
      VALUES (v_business_id, v_item.product_id, v_to_loc, v_item.transfer_quantity)
      ON CONFLICT (product_id, location_id)
      DO UPDATE SET quantity = public.product_stocks.quantity + EXCLUDED.quantity;

      -- Update global total for the product
      UPDATE public.products p
      SET stock_quantity = (
        SELECT COALESCE(SUM(quantity), 0) FROM public.product_stocks WHERE product_id = p.id
      )
      WHERE id = v_item.product_id
        and business_id = v_business_id;

      INSERT INTO public.stock_movements (business_id, product_id, user_id, movement_type, quantity, location_id, reference_type, reference_id)
      VALUES (v_business_id, v_item.product_id, p_user_id, 'transfer', -v_item.transfer_quantity, v_from_loc, 'stock_transfer', p_transfer_id);

      INSERT INTO public.stock_movements (business_id, product_id, user_id, movement_type, quantity, destination_location_id, reference_type, reference_id)
      VALUES (v_business_id, v_item.product_id, p_user_id, 'transfer', v_item.transfer_quantity, v_to_loc, 'stock_transfer', p_transfer_id);
    END LOOP;
    
    UPDATE public.stock_transfers SET completed_at = now() WHERE id = p_transfer_id;
  END IF;

  UPDATE public.stock_transfers SET status = p_new_status WHERE id = p_transfer_id;
END;
$$;

-- MASTER BUSINESS CREATION RPC
CREATE OR REPLACE FUNCTION public.create_business_with_admin(
  p_biz_name text,
  p_admin_email text,
  p_admin_password text,
  p_admin_name text,
  p_plan_id uuid,
  p_status text,
  p_start_date timestamptz,
  p_end_date timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    subscription_end_date
  ) VALUES (
    p_biz_name, 
    p_plan_id, 
    p_status, 
    p_start_date, 
    p_end_date
  ) RETURNING id INTO v_business_id;

  -- 2. Create Auth User (Internal Supabase Table)
  -- We use explicit schema prefixes (auth. and extensions.) to avoid search_path issues.
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
    '',
    '',
    '',
    '',
    '',
    jsonb_build_object('provider', 'email', 'providers', array['email'], 'role', 'admin', 'business_id', v_business_id),
    jsonb_build_object('full_name', p_admin_name),
    'authenticated',
    'authenticated',
    now(),
    now()
  );

  -- 3. The trigger 'handle_new_auth_user' will now fire.
  -- It automatically creates the 'public.users' record.

  -- 4. Create Default Location
  INSERT INTO public.locations (
    business_id, 
    name, 
    is_active
  ) VALUES (
    v_business_id, 
    'Main Branch', 
    true
  ) RETURNING id INTO v_location_id;

  -- 5. Initial Shop Settings
  INSERT INTO public.shop_settings (
    business_id, 
    shop_name, 
    contact_email
  ) VALUES (
    v_business_id, 
    p_biz_name, 
    p_admin_email
  ) ON CONFLICT (business_id) DO NOTHING;

  -- 6. Link Business Owner
  UPDATE public.businesses SET owner_auth_user_id = v_auth_user_id WHERE id = v_business_id;

  RETURN v_business_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_business_stats(p_business_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sales_count integer;
  v_sales_total numeric;
  v_product_count integer;
  v_user_count integer;
BEGIN
  -- SAFETY CHECK
  IF NOT (public.is_platform_admin() OR public.get_user_business_id() = p_business_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT count(*), coalesce(sum(total_amount), 0)
  INTO v_sales_count, v_sales_total
  FROM public.sales
  WHERE business_id = p_business_id;

  SELECT count(*)
  INTO v_product_count
  FROM public.products
  WHERE business_id = p_business_id;

  SELECT count(*)
  INTO v_user_count
  FROM public.users
  WHERE business_id = p_business_id;

  RETURN jsonb_build_object(
    'sales_count', v_sales_count,
    'sales_total', v_sales_total,
    'product_count', v_product_count,
    'user_count', v_user_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_global_sales_total()
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN (SELECT coalesce(sum(total_amount), 0) FROM public.sales);
END;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_auth_user();

drop trigger if exists set_shop_settings_updated_at on public.shop_settings;
create trigger set_shop_settings_updated_at
before update on public.shop_settings
for each row execute procedure public.set_updated_at();

-- Tenant backfill (for existing databases that predate multi-business support)
DO $$
DECLARE
  v_default_business_id uuid;
BEGIN
  select id into v_default_business_id
  from public.businesses
  order by created_at asc
  limit 1;

  if v_default_business_id is null then
    insert into public.businesses (name)
    values ('Default Business')
    returning id into v_default_business_id;
  end if;

  update public.locations l set business_id = v_default_business_id where l.business_id is null;
  update public.users u set business_id = v_default_business_id where u.business_id is null;

  update public.categories c set business_id = v_default_business_id where c.business_id is null;
  update public.customers c set business_id = v_default_business_id where c.business_id is null;
  update public.suppliers s set business_id = v_default_business_id where s.business_id is null;
  update public.products p set business_id = v_default_business_id where p.business_id is null;

  update public.sales s
  set business_id = coalesce(u.business_id, v_default_business_id)
  from public.users u
  where s.business_id is null
    and s.cashier_id = u.id;
  update public.sales s set business_id = v_default_business_id where s.business_id is null;

  update public.purchases p
  set business_id = l.business_id
  from public.locations l
  where p.business_id is null
    and p.location_id = l.id;

  update public.purchases p
  set business_id = u.business_id
  from public.users u
  where p.business_id is null
    and p.user_id = u.id;

  update public.purchases p
  set business_id = v_default_business_id
  where p.business_id is null;

  update public.sale_items si
  set business_id = s.business_id
  from public.sales s
  where si.business_id is null
    and si.sale_id = s.id;
  update public.sale_payments sp
  set business_id = s.business_id
  from public.sales s
  where sp.business_id is null
    and sp.sale_id = s.id;

  update public.purchase_items pi
  set business_id = p.business_id
  from public.purchases p
  where pi.business_id is null
    and pi.purchase_id = p.id;
  update public.purchase_payments pp
  set business_id = p.business_id
  from public.purchases p
  where pp.business_id is null
    and pp.purchase_id = p.id;

  update public.customer_payments cp
  set business_id = c.business_id
  from public.customers c
  where cp.business_id is null
    and cp.customer_id = c.id;

  update public.customer_payments cp
  set business_id = s.business_id
  from public.sales s
  where cp.business_id is null
    and cp.sale_id = s.id;

  update public.customer_payments cp
  set business_id = v_default_business_id
  where cp.business_id is null;

  update public.product_stocks ps
  set business_id = l.business_id
  from public.locations l
  where ps.business_id is null
    and ps.location_id = l.id;

  update public.product_stocks ps
  set business_id = p.business_id
  from public.products p
  where ps.business_id is null
    and ps.product_id = p.id;

  update public.product_stocks ps
  set business_id = v_default_business_id
  where ps.business_id is null;

  update public.stock_counts sc
  set business_id = coalesce(l.business_id, v_default_business_id)
  from public.locations l
  where sc.business_id is null
    and sc.location_id = l.id;
  update public.stock_count_items sci
  set business_id = sc.business_id
  from public.stock_counts sc
  where sci.business_id is null
    and sci.stock_count_id = sc.id;

  update public.stock_transfers st
  set business_id = coalesce(l.business_id, v_default_business_id)
  from public.locations l
  where st.business_id is null
    and st.from_location_id = l.id;
  update public.stock_transfer_items sti
  set business_id = st.business_id
  from public.stock_transfers st
  where sti.business_id is null
    and sti.stock_transfer_id = st.id;

  update public.day_closures dc
  set business_id = l.business_id
  from public.locations l
  where dc.business_id is null
    and dc.location_id = l.id;

  update public.day_closures dc
  set business_id = u.business_id
  from public.users u
  where dc.business_id is null
    and dc.user_id = u.id;

  update public.day_closures dc
  set business_id = v_default_business_id
  where dc.business_id is null;

  update public.stock_movements sm
  set business_id = coalesce(
    (select business_id from public.locations where id = sm.location_id),
    (select business_id from public.locations where id = sm.destination_location_id),
    (select business_id from public.products where id = sm.product_id),
    v_default_business_id
  )
  where sm.business_id is null;

  update public.user_permissions up
  set business_id = coalesce(u.business_id, v_default_business_id)
  from public.users u
  where up.business_id is null
    and up.user_id = u.id;
  update public.user_permissions up set business_id = v_default_business_id where up.business_id is null;

  update public.shop_settings ss set business_id = v_default_business_id where ss.business_id is null;
  insert into public.shop_settings (business_id)
  values (v_default_business_id)
  on conflict (business_id) do nothing;
END $$;

alter table public.users enable row level security;
alter table public.categories enable row level security;
alter table public.customers enable row level security;
alter table public.suppliers enable row level security;
alter table public.products enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.sale_payments enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;
alter table public.purchase_payments enable row level security;
alter table public.customer_payments enable row level security;
alter table public.stock_movements enable row level security;
alter table public.stock_counts enable row level security;
alter table public.stock_count_items enable row level security;
alter table public.stock_transfers enable row level security;
alter table public.stock_transfer_items enable row level security;
alter table public.shop_settings enable row level security;
alter table public.user_permissions enable row level security;
alter table public.day_closures enable row level security;
alter table public.locations enable row level security;
alter table public.product_stocks enable row level security;
alter table public.users enable row level security;
alter table public.businesses enable row level security;
alter table public.platform_admins enable row level security;
alter table public.subscription_plans enable row level security;

-- Businesses (tenants) policies
drop policy if exists "Staff read own business" on public.businesses;
create policy "Staff read own business"
on public.businesses
for select
using (public.is_platform_admin() or id = public.get_user_business_id());

drop policy if exists "Business admins manage own business" on public.businesses;
create policy "Business admins manage own business"
on public.businesses
for all
using (
  public.is_platform_admin()
  or (public.get_user_role() = 'admin' and id = public.get_user_business_id())
)
with check (
  public.is_platform_admin()
  or (public.get_user_role() = 'admin' and id = public.get_user_business_id())
);

-- Platform admins policies
drop policy if exists "Platform admins read platform_admins" on public.platform_admins;
create policy "Platform admins read platform_admins"
on public.platform_admins
for select
using (public.is_platform_admin());

drop policy if exists "Platform admins manage platform_admins" on public.platform_admins;
create policy "Platform admins manage platform_admins"
on public.platform_admins
for all
using (public.is_platform_admin())
with check (public.is_platform_admin());

-- Subscription Plans policies
drop policy if exists "Platform admins manage plans" on public.subscription_plans;
create policy "Platform admins manage plans"
on public.subscription_plans
for all
using (public.is_platform_admin())
with check (public.is_platform_admin());

drop policy if exists "Authenticated users read plans" on public.subscription_plans;
create policy "Authenticated users read plans"
on public.subscription_plans
for select
using (auth.role() = 'authenticated');

drop policy if exists "Users can view active own profile or admin all" on public.users;
create policy "Users can view active own profile or admin all"
on public.users
for select
using (
  auth.uid() = auth_user_id
  or public.is_platform_admin()
  or (public.get_user_role() = 'admin' and business_id = public.get_user_business_id())
);

drop policy if exists "Admins manage users" on public.users;
create policy "Admins manage users"
on public.users
for all
using (
  public.is_platform_admin()
  or (public.get_user_role() = 'admin' and business_id = public.get_user_business_id())
)
with check (
  public.is_platform_admin()
  or (public.get_user_role() = 'admin' and business_id = public.get_user_business_id())
);

drop policy if exists "Authenticated staff read categories" on public.categories;
create policy "Authenticated staff read categories"
on public.categories
for select
using (auth.role() = 'authenticated' and business_id = public.get_user_business_id());

drop policy if exists "Managers and admins manage categories" on public.categories;
drop policy if exists "Privileged staff insert categories" on public.categories;
drop policy if exists "Privileged staff update categories" on public.categories;
drop policy if exists "Privileged staff delete categories" on public.categories;

create policy "Privileged staff insert categories"
on public.categories
for insert
with check (
  public.is_platform_admin()
  or (
    business_id = public.get_user_business_id()
    and (
      public.get_user_role() in ('admin', 'manager')
      or exists (
        select 1
        from public.user_permissions up
        join public.users u on u.id = up.user_id
        where u.auth_user_id = auth.uid()
          and up.business_id = public.get_user_business_id()
          and up.module_key ilike 'Products'
          and up.can_add = true
      )
    )
  )
);

create policy "Privileged staff update categories"
on public.categories
for update
using (
  public.is_platform_admin()
  or (
    business_id = public.get_user_business_id()
    and (
      public.get_user_role() in ('admin', 'manager')
      or exists (
        select 1
        from public.user_permissions up
        join public.users u on u.id = up.user_id
        where u.auth_user_id = auth.uid()
          and up.business_id = public.get_user_business_id()
          and up.module_key ilike 'Products'
          and up.can_edit = true
      )
    )
  )
)
with check (
  public.is_platform_admin()
  or (
    business_id = public.get_user_business_id()
    and (
      public.get_user_role() in ('admin', 'manager')
      or exists (
        select 1
        from public.user_permissions up
        join public.users u on u.id = up.user_id
        where u.auth_user_id = auth.uid()
          and up.business_id = public.get_user_business_id()
          and up.module_key ilike 'Products'
          and up.can_edit = true
      )
    )
  )
);

create policy "Privileged staff delete categories"
on public.categories
for delete
using (
  public.is_platform_admin()
  or (
    business_id = public.get_user_business_id()
    and (
      public.get_user_role() in ('admin', 'manager')
      or exists (
        select 1
        from public.user_permissions up
        join public.users u on u.id = up.user_id
        where u.auth_user_id = auth.uid()
          and up.business_id = public.get_user_business_id()
          and up.module_key ilike 'Products'
          and up.can_delete = true
      )
    )
  )
);

drop policy if exists "Authenticated staff read customers" on public.customers;
create policy "Authenticated staff read customers"
on public.customers
for select
using (
  public.is_platform_admin() 
  or (public.has_module_permission('Customers', 'view') and business_id = public.get_user_business_id())
);

drop policy if exists "Staff manage customers" on public.customers;
create policy "Staff manage customers"
on public.customers
for insert
with check (
  public.is_platform_admin()
  or (public.has_module_permission('Customers', 'add') and business_id = public.get_user_business_id())
);

drop policy if exists "Staff update customers" on public.customers;
create policy "Staff update customers"
on public.customers
for update
using (
  public.is_platform_admin()
  or (public.has_module_permission('Customers', 'edit') and business_id = public.get_user_business_id())
);

drop policy if exists "Staff delete customers" on public.customers;
create policy "Staff delete customers"
on public.customers
for delete
using (
  public.is_platform_admin()
  or (public.has_module_permission('Customers', 'delete') and business_id = public.get_user_business_id())
);

drop policy if exists "Authenticated staff read suppliers" on public.suppliers;
create policy "Authenticated staff read suppliers"
on public.suppliers
for select
using (
  public.is_platform_admin()
  or (public.has_module_permission('Suppliers', 'view') and business_id = public.get_user_business_id())
);

drop policy if exists "Staff manage suppliers" on public.suppliers;
create policy "Staff manage suppliers"
on public.suppliers
for insert
with check (
  public.is_platform_admin()
  or (public.has_module_permission('Suppliers', 'add') and business_id = public.get_user_business_id())
);

drop policy if exists "Staff update suppliers" on public.suppliers;
create policy "Staff update suppliers"
on public.suppliers
for update
using (
  public.is_platform_admin()
  or (public.has_module_permission('Suppliers', 'edit') and business_id = public.get_user_business_id())
);

drop policy if exists "Authenticated staff read products" on public.products;
create policy "Authenticated staff read products"
on public.products
for select
using (
  public.is_platform_admin()
  or (public.has_module_permission('Products', 'view') and business_id = public.get_user_business_id())
);

drop policy if exists "Staff manage products" on public.products;
create policy "Staff manage products"
on public.products
for insert
with check (
  public.is_platform_admin()
  or (public.has_module_permission('Products', 'add') and business_id = public.get_user_business_id())
);

drop policy if exists "Staff update products" on public.products;
create policy "Staff update products"
on public.products
for update
using (
  public.is_platform_admin()
  or (public.has_module_permission('Products', 'edit') and business_id = public.get_user_business_id())
);

drop policy if exists "Authenticated staff read sales" on public.sales;
create policy "Authenticated staff read sales"
on public.sales
for select
using (
  business_id = public.get_user_business_id()
  and (
    public.has_module_permission('Sales', 'view')
    or location_id = public.get_user_location()
  )
);

drop policy if exists "Cashiers and above create sales" on public.sales;
drop policy if exists "Staff create sales" on public.sales;
create policy "Staff create sales"
on public.sales
for insert
with check (
  public.is_platform_admin()
  or (public.has_module_permission('POS', 'add') and business_id = public.get_user_business_id())
  or (public.has_module_permission('Sales', 'add') and business_id = public.get_user_business_id())
);

drop policy if exists "Admins manage all sales" on public.sales;
create policy "Admins manage all sales"
on public.sales
for update
using (
  public.is_platform_admin()
  or (public.get_user_role() = 'admin' and business_id = public.get_user_business_id())
)
with check (
  public.is_platform_admin()
  or (public.get_user_role() = 'admin' and business_id = public.get_user_business_id())
);

drop policy if exists "Authenticated staff read sale items" on public.sale_items;
create policy "Authenticated staff read sale items"
on public.sale_items
for select
using (auth.role() = 'authenticated' and business_id = public.get_user_business_id());

drop policy if exists "Cashiers and above create sale items" on public.sale_items;
create policy "Cashiers and above create sale items"
on public.sale_items
for insert
with check (
  public.is_platform_admin()
  or (public.get_user_role() in ('admin', 'manager', 'cashier') and business_id = public.get_user_business_id())
);

drop policy if exists "Authenticated staff read sale payments" on public.sale_payments;
create policy "Authenticated staff read sale payments"
on public.sale_payments
for select
using (auth.role() = 'authenticated' and business_id = public.get_user_business_id());

drop policy if exists "Cashiers and above manage sale payments" on public.sale_payments;
create policy "Cashiers and above manage sale payments"
on public.sale_payments
for all
using (
  public.is_platform_admin()
  or (public.get_user_role() in ('admin', 'manager', 'cashier') and business_id = public.get_user_business_id())
)
with check (
  public.is_platform_admin()
  or (public.get_user_role() in ('admin', 'manager', 'cashier') and business_id = public.get_user_business_id())
);

drop policy if exists "Staff read purchases" on public.purchases;
create policy "Staff read purchases"
on public.purchases
for select
using (
  public.is_platform_admin()
  or (public.has_module_permission('Purchases', 'view') and business_id = public.get_user_business_id())
);

drop policy if exists "Staff insert purchases" on public.purchases;
create policy "Staff insert purchases"
on public.purchases
for insert
with check (
  public.is_platform_admin()
  or (public.has_module_permission('Purchases', 'add') and business_id = public.get_user_business_id())
);

drop policy if exists "Staff update purchases" on public.purchases;
create policy "Staff update purchases"
on public.purchases
for update
using (
  public.is_platform_admin()
  or (public.has_module_permission('Purchases', 'edit') and business_id = public.get_user_business_id())
);

drop policy if exists "Staff delete purchases" on public.purchases;
create policy "Staff delete purchases"
on public.purchases
for delete
using (
  public.is_platform_admin()
  or (public.has_module_permission('Purchases', 'delete') and business_id = public.get_user_business_id())
);

drop policy if exists "Staff read purchase items" on public.purchase_items;
create policy "Staff read purchase items"
on public.purchase_items
for select
using (
  public.is_platform_admin()
  or (public.has_module_permission('Purchases', 'view') and business_id = public.get_user_business_id())
);

drop policy if exists "Staff manage purchase items" on public.purchase_items;
create policy "Staff manage purchase items"
on public.purchase_items
for all
using (
  public.is_platform_admin()
  or (public.has_module_permission('Purchases', 'edit') and business_id = public.get_user_business_id())
)
with check (
  public.is_platform_admin()
  or (public.has_module_permission('Purchases', 'add') and business_id = public.get_user_business_id())
);

drop policy if exists "Staff read purchase payments" on public.purchase_payments;
create policy "Staff read purchase payments"
on public.purchase_payments
for select
using (
  public.is_platform_admin()
  or (public.has_module_permission('Purchases', 'view') and business_id = public.get_user_business_id())
);

drop policy if exists "Staff manage purchase payments" on public.purchase_payments;
create policy "Staff manage purchase payments"
on public.purchase_payments
for all
using (
  public.is_platform_admin()
  or (public.has_module_permission('Purchases', 'edit') and business_id = public.get_user_business_id())
)
with check (
  public.is_platform_admin()
  or (public.has_module_permission('Purchases', 'add') and business_id = public.get_user_business_id())
);

drop policy if exists "Staff read customer payments" on public.customer_payments;
create policy "Staff read customer payments"
on public.customer_payments
for select
using (public.get_user_role() in ('admin', 'manager', 'cashier') and business_id = public.get_user_business_id());

drop policy if exists "Staff manage customer payments" on public.customer_payments;
create policy "Staff manage customer payments"
on public.customer_payments
for all
using (
  public.is_platform_admin()
  or (public.get_user_role() in ('admin', 'manager', 'cashier') and business_id = public.get_user_business_id())
)
with check (
  public.is_platform_admin()
  or (public.get_user_role() in ('admin', 'manager', 'cashier') and business_id = public.get_user_business_id())
);

drop policy if exists "Staff read stock movements" on public.stock_movements;
create policy "Staff read stock movements"
on public.stock_movements
for select
using (
  public.is_platform_admin()
  or (public.has_module_permission('Stock', 'view') and business_id = public.get_user_business_id())
);

drop policy if exists "Staff manage stock movements" on public.stock_movements;
create policy "Staff manage stock movements"
on public.stock_movements
for insert
with check (
  public.is_platform_admin()
  or (public.has_module_permission('Stock', 'add') and business_id = public.get_user_business_id())
);

drop policy if exists "Staff read stock counts" on public.stock_counts;
create policy "Staff read stock counts"
on public.stock_counts
for select
using (
  public.is_platform_admin()
  or (public.has_module_permission('Stock', 'view') and business_id = public.get_user_business_id())
);

drop policy if exists "Staff insert stock counts" on public.stock_counts;
create policy "Staff insert stock counts"
on public.stock_counts
for insert
with check (
  public.is_platform_admin()
  or (public.has_module_permission('Stock', 'add') and business_id = public.get_user_business_id())
);

drop policy if exists "Staff update stock counts" on public.stock_counts;
create policy "Staff update stock counts"
on public.stock_counts
for update
using (
  public.is_platform_admin()
  or (public.has_module_permission('Stock', 'edit') and business_id = public.get_user_business_id())
);

drop policy if exists "Staff delete stock counts" on public.stock_counts;
create policy "Staff delete stock counts"
on public.stock_counts
for delete
using (
  public.is_platform_admin()
  or (public.has_module_permission('Stock', 'delete') and business_id = public.get_user_business_id())
);

drop policy if exists "Staff read stock count items" on public.stock_count_items;
create policy "Staff read stock count items"
on public.stock_count_items
for select
using (
  public.is_platform_admin()
  or (public.has_module_permission('Stock', 'view') and business_id = public.get_user_business_id())
);

drop policy if exists "Staff manage stock count items" on public.stock_count_items;
create policy "Staff manage stock count items"
on public.stock_count_items
for all
using (
  public.is_platform_admin()
  or (public.has_module_permission('Stock', 'edit') and business_id = public.get_user_business_id())
)
with check (
  public.is_platform_admin()
  or (public.has_module_permission('Stock', 'add') and business_id = public.get_user_business_id())
);

drop policy if exists "Staff read stock transfers" on public.stock_transfers;
create policy "Staff read stock transfers"
on public.stock_transfers
for select
using (
  public.is_platform_admin()
  or (public.has_module_permission('Stock', 'view') and business_id = public.get_user_business_id())
);

drop policy if exists "Staff insert stock transfers" on public.stock_transfers;
create policy "Staff insert stock transfers"
on public.stock_transfers
for insert
with check (
  public.is_platform_admin()
  or (public.has_module_permission('Stock', 'add') and business_id = public.get_user_business_id())
);

drop policy if exists "Staff update stock transfers" on public.stock_transfers;
create policy "Staff update stock transfers"
on public.stock_transfers
for update
using (
  public.is_platform_admin()
  or (public.has_module_permission('Stock', 'edit') and business_id = public.get_user_business_id())
);

drop policy if exists "Staff delete stock transfers" on public.stock_transfers;
create policy "Staff delete stock transfers"
on public.stock_transfers
for delete
using (
  public.is_platform_admin()
  or (public.has_module_permission('Stock', 'delete') and business_id = public.get_user_business_id())
);

drop policy if exists "Staff read stock transfer items" on public.stock_transfer_items;
create policy "Staff read stock transfer items"
on public.stock_transfer_items
for select
using (
  public.is_platform_admin()
  or (public.has_module_permission('Stock', 'view') and business_id = public.get_user_business_id())
);

drop policy if exists "Staff manage stock transfer items" on public.stock_transfer_items;
create policy "Staff manage stock transfer items"
on public.stock_transfer_items
for all
using (
  public.is_platform_admin()
  or (public.has_module_permission('Stock', 'edit') and business_id = public.get_user_business_id())
)
with check (
  public.is_platform_admin()
  or (public.has_module_permission('Stock', 'add') and business_id = public.get_user_business_id())
);

drop policy if exists "Authenticated staff read shop settings" on public.shop_settings;
create policy "Authenticated staff read shop settings"
on public.shop_settings
for select
using (
  auth.role() = 'authenticated'
  and (public.is_platform_admin() or business_id = public.get_user_business_id())
);

drop policy if exists "Admins update shop settings" on public.shop_settings;
create policy "Admins update shop settings"
on public.shop_settings
for all
using (
  public.is_platform_admin()
  or (public.get_user_role() = 'admin' and business_id = public.get_user_business_id())
)
with check (
  public.is_platform_admin()
  or (public.get_user_role() = 'admin' and business_id = public.get_user_business_id())
);

drop policy if exists "Users read own permissions or admin all" on public.user_permissions;
create policy "Users read own permissions or admin all"
on public.user_permissions
for select
using (
  public.is_platform_admin()
  or (
    business_id = public.get_user_business_id()
    and (
      public.get_user_role() = 'admin'
      or exists (
        select 1
        from public.users u
        where u.id = user_id
          and u.auth_user_id = auth.uid()
      )
    )
  )
);

drop policy if exists "Admins manage user permissions" on public.user_permissions;
create policy "Admins manage user permissions"
on public.user_permissions
for all
using (
  public.is_platform_admin()
  or (public.get_user_role() = 'admin' and business_id = public.get_user_business_id())
)
with check (
  public.is_platform_admin()
  or (public.get_user_role() = 'admin' and business_id = public.get_user_business_id())
);

drop policy if exists "Staff read own day closures or admin all" on public.day_closures;
create policy "Staff read own day closures or admin all"
on public.day_closures
for select
using (
  business_id = public.get_user_business_id()
  and (
  public.get_user_role() = 'admin'
  or exists (
    select 1
    from public.users u
    where u.id = user_id
      and u.auth_user_id = auth.uid()
  )
  )
);

drop policy if exists "Cashiers and above manage own day closures" on public.day_closures;
create policy "Cashiers and above manage own day closures"
on public.day_closures
for all
using (public.get_user_role() in ('admin', 'manager', 'cashier') and business_id = public.get_user_business_id())
with check (public.get_user_role() in ('admin', 'manager', 'cashier') and business_id = public.get_user_business_id());

-- Locations Policies (Allow all staff to see sites for dropdowns)
drop policy if exists "Authenticated staff read locations" on public.locations;
create policy "Authenticated staff read locations"
on public.locations for select
to authenticated
using (public.is_platform_admin() or business_id = public.get_user_business_id());

drop policy if exists "Admins manage locations" on public.locations;
create policy "Admins manage locations"
on public.locations for all
to authenticated
using (
  public.is_platform_admin()
  or (public.get_user_role() = 'admin' and business_id = public.get_user_business_id())
)
with check (
  public.is_platform_admin()
  or (public.get_user_role() = 'admin' and business_id = public.get_user_business_id())
);

-- Product Stocks Policies
drop policy if exists "Staff read product stocks" on public.product_stocks;
create policy "Staff read product stocks"
on public.product_stocks
for select
using (
  public.is_platform_admin()
  or (public.has_module_permission('Products', 'view') and business_id = public.get_user_business_id())
);

drop policy if exists "Staff manage product stocks" on public.product_stocks;
create policy "Staff manage product stocks"
on public.product_stocks
for all
using (
  public.is_platform_admin()
  or (public.has_module_permission('Products', 'edit') and business_id = public.get_user_business_id())
)
with check (
  public.is_platform_admin()
  or (public.has_module_permission('Products', 'add') and business_id = public.get_user_business_id())
);

-- Purchase Transactions
-- create or replace function public.create_purchase_transaction(
--   p_supplier_id uuid,
--   p_user_id uuid,
--   p_location_id uuid,
--   p_total_cost numeric,
--   p_payment_status public.payment_status,
--   p_items jsonb,
--   p_notes text default null
-- )
-- returns uuid
-- language plpgsql
-- security definer
-- set search_path = public
-- as $$
-- declare
--   v_purchase_id uuid;
--   v_item jsonb;
--   v_product_id uuid;
--   v_quantity integer;
--   v_cost_price numeric(12,2);
--   v_selling_price numeric(12,2);
-- begin
--   insert into public.purchases (
--     supplier_id,
--     user_id,
--     location_id,
--     total_cost,
--     payment_status,
--     notes
--   )
--   values (
--     p_supplier_id,
--     p_user_id,
--     p_location_id,
--     p_total_cost,
--     p_payment_status,
--     nullif(p_notes, '')
--   )
--   returning id into v_purchase_id;

--   for v_item in select * from jsonb_array_elements(p_items)
--   loop
--     v_product_id := (v_item ->> 'product_id')::uuid;
--     v_quantity := (v_item ->> 'quantity')::integer;
--     v_cost_price := (v_item ->> 'cost_price')::numeric(12,2);
--     v_selling_price := (v_item ->> 'selling_price')::numeric(12,2);

--     insert into public.purchase_items (purchase_id, product_id, quantity, cost_price, line_total)
--     values (v_purchase_id, v_product_id, v_quantity, v_cost_price, v_quantity * v_cost_price);

--     -- INCREMENT stock AND Update Prices
--     update public.products
--     set 
--       stock_quantity = stock_quantity + v_quantity,
--       cost_price = v_cost_price,
--       selling_price = coalesce(v_selling_price, selling_price)
--     where id = v_product_id;

--     if p_location_id is not null then
--       insert into public.product_stocks (product_id, location_id, quantity)
--       values (v_product_id, p_location_id, v_quantity)
--       on conflict (product_id, location_id)
--       do update set quantity = public.product_stocks.quantity + v_quantity;
--     end if;

--     insert into public.stock_movements (
--       product_id,
--       user_id,
--       movement_type,
--       quantity,
--       destination_location_id,
--       reference_type,
--       reference_id
--     )
--     values (
--       v_product_id,
--       p_user_id,
--       'in',
--       v_quantity,
--       p_location_id,
--       'purchase',
--       v_purchase_id
--     );
--   end loop;

--   return v_purchase_id;
-- end;
-- $$;

create or replace function public.delete_purchase_transaction(p_purchase_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
  v_location_id uuid;
  v_business_id uuid;
begin
  select location_id, business_id into v_location_id, v_business_id
  from public.purchases
  where id = p_purchase_id;

  -- DECREMENT stock from the specific location where the purchase was made
  for v_item in select product_id, quantity from public.purchase_items where purchase_id = p_purchase_id loop
    -- Update global stock (if applicable)
    update public.products
    set stock_quantity = stock_quantity - v_item.quantity
    where id = v_item.product_id
      and business_id = v_business_id;

    -- Update location specific stock
    if v_location_id is not null then
      insert into public.product_stocks (business_id, product_id, location_id, quantity)
      values (v_business_id, v_item.product_id, v_location_id, -v_item.quantity)
      on conflict (product_id, location_id)
      do update set quantity = public.product_stocks.quantity - EXCLUDED.quantity;
    end if;

    -- Log stock movement
    insert into public.stock_movements (business_id, product_id, movement_type, quantity, location_id, reference_type, reference_id)
    values (v_business_id, v_item.product_id, 'out', v_item.quantity, v_location_id, 'purchase_reversal', p_purchase_id);
  end loop;

  -- Finally delete the purchase record (cascade will handle purchase_items)
  delete from public.purchases where id = p_purchase_id;
end;
$$;

-- PROFILE RECOVERY & INITIAL DATA
-- This section recovers missing users from Auth data and ensures 
-- at least one location exists. It safely preserves "real accounts".

DO $$
DECLARE
  v_default_business_id uuid;
BEGIN
  select id into v_default_business_id
  from public.businesses
  order by created_at asc
  limit 1;

  if v_default_business_id is null then
    insert into public.businesses (name)
    values ('Default Business')
    returning id into v_default_business_id;
  end if;

  -- 1. Ensure at least one location exists (per default business)
  insert into public.locations (business_id, name)
  values (v_default_business_id, 'Main Store')
  on conflict (business_id, name) do nothing;

  -- 2. Sync existing Auth users to the public.users table (attach to default business if missing)
  insert into public.users (auth_user_id, business_id, email, full_name, role)
  select
    id,
    coalesce(
      (
        select b.id
        from public.businesses b
        where b.id = nullif(raw_app_meta_data->>'business_id','')::uuid
        limit 1
      ),
      v_default_business_id
    ),
    email,
    coalesce(raw_user_meta_data->>'full_name', split_part(email, '@', 1)),
    case
      when lower(coalesce(raw_app_meta_data->>'role', raw_user_meta_data->>'role', '')) = 'super_admin'
        then 'admin'::public.app_role
      when lower(coalesce(raw_app_meta_data->>'role', raw_user_meta_data->>'role', '')) in ('admin', 'manager', 'cashier')
        then lower(coalesce(raw_app_meta_data->>'role', raw_user_meta_data->>'role'))::public.app_role
      else 'cashier'::public.app_role
    end
  from auth.users
  on conflict (auth_user_id) do update
  set
    business_id = coalesce(public.users.business_id, excluded.business_id),
    full_name = excluded.full_name,
    email = excluded.email;

  -- Mark any legacy super admins as platform admins
  insert into public.platform_admins (auth_user_id)
  select id
  from auth.users
  where lower(coalesce(raw_app_meta_data->>'role', raw_user_meta_data->>'role', '')) = 'super_admin'
  on conflict (auth_user_id) do nothing;

  -- 3. Ensure all users have a base set of permissions if they are missing
  insert into public.user_permissions (business_id, user_id, module_key, can_view, can_add, can_edit, can_delete)
  select
    u.business_id,
    u.id,
    m.module_key,
    true,
    (u.role in ('admin', 'manager')),
    (u.role in ('admin', 'manager')),
    (u.role = 'admin')
  from public.users u
  cross join (
    select unnest(array['Dashboard', 'POS', 'Products', 'Sales', 'Stock', 'Customers', 'Reports', 'Purchases', 'Suppliers', 'Settings']) as module_key
  ) m
  where not exists (
    select 1 from public.user_permissions up where up.user_id = u.id
  )
  on conflict (user_id, module_key) do nothing;
END $$;

-- 4. FINAL CLEANUP: Ensure legacy data has a location_id Assigned
-- This fixes the "Empty Sales Table" problem for existing rows
DO $$
DECLARE
  v_default_loc_id uuid;
BEGIN
  SELECT id INTO v_default_loc_id FROM public.locations ORDER BY created_at ASC LIMIT 1;
  
  IF v_default_loc_id IS NOT NULL THEN
    UPDATE public.sales SET location_id = v_default_loc_id WHERE location_id IS NULL;
    UPDATE public.stock_movements SET location_id = v_default_loc_id WHERE location_id IS NULL;
    UPDATE public.day_closures SET location_id = v_default_loc_id WHERE location_id IS NULL;
    UPDATE public.stock_counts SET location_id = v_default_loc_id WHERE location_id IS NULL;
  END IF;
END $$;

-- Cash Registers / Shifts
create table if not exists public.cash_registers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  user_id uuid not null references public.users(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete restrict,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  opening_amount numeric(12,2) not null default 0,
  closing_amount numeric(12,2),
  total_sales numeric(12,2),
  status text not null default 'open' check (status in ('open', 'closed')),
  notes text,
  created_at timestamptz not null default now()
);

ALTER TABLE public.cash_registers ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES public.businesses(id) ON DELETE RESTRICT;

-- Backfill cash_registers.business_id for existing databases
DO $$
DECLARE
  v_default_business_id uuid;
BEGIN
  select id into v_default_business_id
  from public.businesses
  order by created_at asc
  limit 1;

  if v_default_business_id is null then
    insert into public.businesses (name)
    values ('Default Business')
    returning id into v_default_business_id;
  end if;

  update public.cash_registers cr
  set business_id = l.business_id
  from public.locations l
  where cr.business_id is null
    and cr.location_id = l.id;

  update public.cash_registers cr
  set business_id = u.business_id
  from public.users u
  where cr.business_id is null
    and cr.user_id = u.id;

  update public.cash_registers cr
  set business_id = v_default_business_id
  where cr.business_id is null;
END $$;

-- Ensure a user can only have one open register at a time per location
create unique index if not exists idx_unique_open_register on public.cash_registers(user_id, location_id) where status = 'open';

-- RLS
alter table public.cash_registers enable row level security;

drop policy if exists "Users or admin read cash_registers" on public.cash_registers;
create policy "Users or admin read cash_registers" on public.cash_registers for select using (
  public.is_platform_admin()
  or (
    business_id = public.get_user_business_id()
    and (
      public.get_user_role() = 'admin'
      or exists (select 1 from public.users u where u.id = user_id and u.auth_user_id = auth.uid())
    )
  )
);

drop policy if exists "Users can manage own cash_registers" on public.cash_registers;
create policy "Users can manage own cash_registers" on public.cash_registers for all using (
  public.is_platform_admin()
  or (
    business_id = public.get_user_business_id()
    and (
      public.get_user_role() = 'admin'
      or exists (select 1 from public.users u where u.id = user_id and u.auth_user_id = auth.uid())
    )
  )
) with check (
  public.is_platform_admin()
  or (
    business_id = public.get_user_business_id()
    and (
      public.get_user_role() = 'admin'
      or exists (select 1 from public.users u where u.id = user_id and u.auth_user_id = auth.uid())
    )
  )
);
-- ENABLE REALTIME
-- This adds all business-critical tables to the realtime publication
-- Secure multi-tenancy is handled by the frontend refetching data via RLS-protected services.
BEGIN;
  -- Drop existing if any and recreate to ensure clean state
  DROP PUBLICATION IF EXISTS supabase_realtime;
  CREATE PUBLICATION supabase_realtime FOR TABLE 
    public.businesses,
    public.locations,
    public.shop_settings,
    public.users,
    public.user_permissions,
    public.user_locations,
    public.categories,
    public.products,
    public.product_stocks,
    public.customers,
    public.suppliers,
    public.sales,
    public.sale_items,
    public.sale_payments,
    public.purchases,
    public.purchase_items,
    public.purchase_payments,
    public.customer_payments,
    public.stock_movements,
    public.stock_counts,
    public.stock_count_items,
    public.stock_transfers,
    public.stock_transfer_items,
    public.day_closures,
    public.cash_registers;
COMMIT;
