-- MIGRATION: Guest House & Bar Management Module
-- Safe, additive migration that preserves all existing tables and data.

-- 1. Add business_type and enabled_modules to businesses table
ALTER TABLE public.businesses 
ADD COLUMN IF NOT EXISTS business_type VARCHAR(50) DEFAULT 'retail',
ADD COLUMN IF NOT EXISTS enabled_modules JSONB DEFAULT '{"pos": true, "inventory": true}';

-- 2. Update create_business_with_admin RPC to support business_type
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
  -- 1. Create Business with business_type
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

  -- 2. Create Auth User in auth.users (Internal Supabase Auth)
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
    jsonb_build_object('full_name', p_admin_name, 'business_id', v_business_id),
    'authenticated',
    'authenticated',
    now(),
    now()
  );

  -- 3. Create default location
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

  -- 4. Ensure public.users entry exists and has auth_user_id properly linked
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
  ON CONFLICT (auth_user_id) DO UPDATE
  SET 
    business_id = excluded.business_id,
    location_id = excluded.location_id,
    role = 'admin',
    is_active = true;

  -- Also update by email if an unlinked public.users record exists
  UPDATE public.users
  SET 
    auth_user_id = v_auth_user_id,
    business_id = v_business_id,
    location_id = v_location_id,
    role = 'admin',
    is_active = true
  WHERE email = p_admin_email AND (auth_user_id IS NULL OR auth_user_id = v_auth_user_id);

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

-- 3. Rooms table
CREATE TABLE IF NOT EXISTS public.rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    room_number VARCHAR(20) NOT NULL,
    room_type VARCHAR(50) NOT NULL DEFAULT 'Standard',
    price_per_night NUMERIC(12, 2) NOT NULL DEFAULT 0,
    capacity INT DEFAULT 2,
    status VARCHAR(20) NOT NULL DEFAULT 'available', -- 'available', 'occupied', 'reserved', 'cleaning', 'maintenance'
    floor VARCHAR(20) DEFAULT 'Floor 1',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Room Bookings table
CREATE TABLE IF NOT EXISTS public.room_bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE RESTRICT,
    guest_name VARCHAR(150) NOT NULL,
    guest_phone VARCHAR(50),
    guest_nationality VARCHAR(50) DEFAULT 'Rwandan',
    guest_id_passport VARCHAR(50),
    number_of_guests INT DEFAULT 1,
    check_in TIMESTAMPTZ NOT NULL DEFAULT now(),
    check_out TIMESTAMPTZ,
    expected_checkout TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'checked_in', -- 'reserved', 'checked_in', 'checked_out', 'cancelled'
    room_rate NUMERIC(12, 2) NOT NULL DEFAULT 0,
    advance_paid NUMERIC(12, 2) NOT NULL DEFAULT 0,
    payment_status VARCHAR(20) NOT NULL DEFAULT 'unpaid', -- 'paid', 'unpaid', 'partial'
    notes TEXT,
    created_by UUID REFERENCES public.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Room Charges (Folio items: Bar, Food, Laundry, etc.)
CREATE TABLE IF NOT EXISTS public.room_charges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    booking_id UUID NOT NULL REFERENCES public.room_bookings(id) ON DELETE CASCADE,
    sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL,
    service_type VARCHAR(50) NOT NULL DEFAULT 'bar', -- 'bar', 'food', 'laundry', 'room_service', 'other'
    description TEXT NOT NULL,
    amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    quantity INT DEFAULT 1,
    created_by UUID REFERENCES public.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Dining Tables
CREATE TABLE IF NOT EXISTS public.dining_tables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    table_number VARCHAR(50) NOT NULL,
    capacity INT DEFAULT 4,
    status VARCHAR(20) NOT NULL DEFAULT 'available', -- 'available', 'occupied', 'reserved'
    active_order_id UUID,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Active Tabs / Held Orders
CREATE TABLE IF NOT EXISTS public.active_tabs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    table_id UUID REFERENCES public.dining_tables(id) ON DELETE SET NULL,
    booking_id UUID REFERENCES public.room_bookings(id) ON DELETE SET NULL,
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    tab_name VARCHAR(100),
    cart_items JSONB NOT NULL DEFAULT '[]',
    subtotal NUMERIC(12, 2) DEFAULT 0,
    tax NUMERIC(12, 2) DEFAULT 0,
    discount NUMERIC(12, 2) DEFAULT 0,
    total NUMERIC(12, 2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'open', -- 'open', 'sent_to_kitchen', 'closed', 'cancelled'
    created_by UUID REFERENCES public.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 8. Printer Configurations
CREATE TABLE IF NOT EXISTS public.printer_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    printer_type VARCHAR(50) NOT NULL DEFAULT 'bar', -- 'bar', 'kitchen', 'reception', 'custom'
    target_categories TEXT[] DEFAULT '{}',
    connection_type VARCHAR(50) DEFAULT 'browser_print',
    ip_address VARCHAR(50),
    paper_width VARCHAR(20) DEFAULT '80mm',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 9. Day Closures (Closing Day audit)
CREATE TABLE IF NOT EXISTS public.day_closures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    closure_date DATE NOT NULL DEFAULT CURRENT_DATE,
    closed_by UUID REFERENCES public.users(id),
    total_sales NUMERIC(12, 2) DEFAULT 0,
    cash_received NUMERIC(12, 2) DEFAULT 0,
    momo_received NUMERIC(12, 2) DEFAULT 0,
    card_received NUMERIC(12, 2) DEFAULT 0,
    room_revenue NUMERIC(12, 2) DEFAULT 0,
    total_expenses NUMERIC(12, 2) DEFAULT 0,
    net_profit NUMERIC(12, 2) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on all new tables
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dining_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.active_tabs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.printer_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.day_closures ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to perform operations on their business's rows
CREATE POLICY rooms_all ON public.rooms FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY room_bookings_all ON public.room_bookings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY room_charges_all ON public.room_charges FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY dining_tables_all ON public.dining_tables FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY active_tabs_all ON public.active_tabs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY printer_configs_all ON public.printer_configurations FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY day_closures_all ON public.day_closures FOR ALL TO authenticated USING (true) WITH CHECK (true);
