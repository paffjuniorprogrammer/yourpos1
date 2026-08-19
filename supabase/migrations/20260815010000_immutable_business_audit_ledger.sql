-- Immutable business audit ledger.
-- The audit table deliberately has no foreign keys. It must survive deletion of
-- the related user, business, product, customer, or any other source record.
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid,
  business_name text,
  user_id uuid,
  actor_auth_user_id uuid,
  actor_name text NOT NULL DEFAULT 'System',
  action text NOT NULL,
  module text NOT NULL DEFAULT 'system',
  entity_type text NOT NULL,
  entity_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS business_name text;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS actor_auth_user_id uuid;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS actor_name text NOT NULL DEFAULT 'System';
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS entity_type text NOT NULL DEFAULT 'unknown';
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS entity_id text;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS before_data jsonb;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS after_data jsonb;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS details jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS module text NOT NULL DEFAULT 'system';

-- Old versions sometimes linked audit rows to source records. Remove those
-- links so an audit row can never disappear or fail because its source does.
DO $$
DECLARE v_constraint record;
BEGIN
  FOR v_constraint IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.audit_logs'::regclass AND contype = 'f'
  LOOP
    EXECUTE format('ALTER TABLE public.audit_logs DROP CONSTRAINT %I', v_constraint.conname);
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_audit_logs_business_created ON public.audit_logs (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_created ON public.audit_logs (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_created ON public.audit_logs (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.write_audit_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before jsonb := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END;
  v_after jsonb := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END;
  v_row jsonb;
  v_business_id uuid;
  v_user_id uuid;
  v_actor_name text := 'System';
  v_business_name text;
  v_entity_id text;
  v_module text;
BEGIN
  v_row := coalesce(v_after, v_before);
  v_business_id := nullif(v_row->>'business_id', '')::uuid;
  v_entity_id := coalesce(
    nullif(v_row->>'id', ''),
    nullif(v_row->>'product_id', '') || ':' || nullif(v_row->>'location_id', ''),
    nullif(v_row->>'user_id', '') || ':' || nullif(v_row->>'module_key', ''),
    nullif(v_row->>'stock_count_id', '') || ':' || nullif(v_row->>'product_id', ''),
    nullif(v_row->>'stock_transfer_id', '') || ':' || nullif(v_row->>'product_id', '')
  );

  SELECT id, full_name INTO v_user_id, v_actor_name
  FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1;
  v_actor_name := coalesce(v_actor_name, 'System');

  IF v_business_id IS NULL THEN
    v_business_id := (SELECT business_id FROM public.users WHERE id = v_user_id);
  END IF;
  SELECT name INTO v_business_name FROM public.businesses WHERE id = v_business_id;

  v_module := CASE TG_TABLE_NAME
    WHEN 'products' THEN 'products'
    WHEN 'categories' THEN 'products'
    WHEN 'product_stocks' THEN 'inventory'
    WHEN 'stock_movements' THEN 'inventory'
    WHEN 'stock_counts' THEN 'inventory'
    WHEN 'stock_count_items' THEN 'inventory'
    WHEN 'stock_transfers' THEN 'inventory'
    WHEN 'stock_transfer_items' THEN 'inventory'
    WHEN 'sales' THEN 'sales'
    WHEN 'sale_items' THEN 'sales'
    WHEN 'sale_payments' THEN 'sales'
    WHEN 'purchases' THEN 'purchases'
    WHEN 'purchase_items' THEN 'purchases'
    WHEN 'purchase_payments' THEN 'purchases'
    WHEN 'customers' THEN 'customers'
    WHEN 'suppliers' THEN 'suppliers'
    WHEN 'users' THEN 'users'
    WHEN 'user_permissions' THEN 'users'
    WHEN 'user_locations' THEN 'users'
    WHEN 'locations' THEN 'settings'
    WHEN 'businesses' THEN 'business'
    ELSE 'system'
  END;

  INSERT INTO public.audit_logs (
    business_id, business_name, user_id, actor_auth_user_id, actor_name,
    action, module, entity_type, entity_id, details, before_data, after_data
  ) VALUES (
    v_business_id, v_business_name, v_user_id, auth.uid(), v_actor_name,
    lower(TG_OP), v_module, TG_TABLE_NAME, v_entity_id,
    jsonb_build_object('schema', TG_TABLE_SCHEMA, 'operation', lower(TG_OP)), v_before, v_after
  );

  RETURN coalesce(NEW, OLD);
END;
$$;

-- Attach auditing to the core business records. This is database-side, so it
-- records changes made from the POS, RPCs, imports, or future admin screens.
DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'businesses', 'users', 'user_permissions', 'user_locations', 'locations',
    'categories', 'products', 'product_stocks', 'stock_movements',
    'stock_counts', 'stock_count_items', 'stock_transfers', 'stock_transfer_items',
    'customers', 'suppliers', 'sales', 'sale_items', 'sale_payments',
    'purchases', 'purchase_items', 'purchase_payments', 'customer_payments',
    'purchase_requisitions', 'cash_registers', 'shop_settings'
  ] LOOP
    IF to_regclass('public.' || v_table) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%I ON public.%I', v_table, v_table);
      EXECUTE format(
        'CREATE TRIGGER trg_audit_%I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.write_audit_log()',
        v_table, v_table
      );
    END IF;
  END LOOP;
END $$;

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Platform admins read all audit logs" ON public.audit_logs;
CREATE POLICY "Platform admins read all audit logs"
ON public.audit_logs FOR SELECT TO authenticated
USING (public.is_platform_admin());

DROP POLICY IF EXISTS "Business admins read own audit logs" ON public.audit_logs;
CREATE POLICY "Business admins read own audit logs"
ON public.audit_logs FOR SELECT TO authenticated
USING (
  business_id = public.get_user_business_id()
  AND public.get_user_role() = 'admin'
);

-- Audit entries are written only by the SECURITY DEFINER trigger above.
REVOKE INSERT, UPDATE, DELETE ON public.audit_logs FROM anon, authenticated;
