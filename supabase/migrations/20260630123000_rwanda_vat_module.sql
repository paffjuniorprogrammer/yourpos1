ALTER TABLE public.shop_settings
  ADD COLUMN IF NOT EXISTS tin_number text,
  ADD COLUMN IF NOT EXISTS vat_registration_number text,
  ADD COLUMN IF NOT EXISTS ebm_serial_number text,
  ADD COLUMN IF NOT EXISTS vat_registration_status text NOT NULL DEFAULT 'not_registered',
  ADD COLUMN IF NOT EXISTS vat_price_type text NOT NULL DEFAULT 'inclusive',
  ADD COLUMN IF NOT EXISTS tax_period text NOT NULL DEFAULT 'monthly';

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS is_vat_registered boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS vat_registration_number text;

UPDATE public.suppliers
SET is_vat_registered = true
WHERE is_vat_registered = false;

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS vat_rate numeric(5,2) NOT NULL DEFAULT 18,
  ADD COLUMN IF NOT EXISTS price_type text NOT NULL DEFAULT 'inclusive',
  ADD COLUMN IF NOT EXISTS amount_before_vat numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS output_vat numeric(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS vat_rate numeric(5,2) NOT NULL DEFAULT 18,
  ADD COLUMN IF NOT EXISTS amount_before_vat numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS output_vat numeric(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS vat_rate numeric(5,2) NOT NULL DEFAULT 18,
  ADD COLUMN IF NOT EXISTS supplier_vat_registered boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS price_type text NOT NULL DEFAULT 'inclusive',
  ADD COLUMN IF NOT EXISTS amount_before_vat numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS input_vat numeric(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.purchase_items
  ADD COLUMN IF NOT EXISTS vat_rate numeric(5,2) NOT NULL DEFAULT 18,
  ADD COLUMN IF NOT EXISTS supplier_vat_registered boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS amount_before_vat numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS input_vat numeric(12,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.vat_audit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  source_type text NOT NULL CHECK (source_type IN ('sale', 'purchase')),
  source_id uuid NOT NULL,
  transaction_date timestamptz NOT NULL DEFAULT now(),
  vat_rate numeric(5,2) NOT NULL DEFAULT 18,
  amount_before_vat numeric(12,2) NOT NULL DEFAULT 0,
  input_vat numeric(12,2) NOT NULL DEFAULT 0,
  output_vat numeric(12,2) NOT NULL DEFAULT 0,
  total_amount numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vat_audit_business_period
  ON public.vat_audit_transactions(business_id, transaction_date);

CREATE INDEX IF NOT EXISTS idx_sales_vat_period
  ON public.sales(business_id, created_at, output_vat);

CREATE INDEX IF NOT EXISTS idx_purchases_vat_period
  ON public.purchases(business_id, purchase_date, input_vat);

ALTER TABLE public.vat_audit_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read vat audit" ON public.vat_audit_transactions;
CREATE POLICY "Staff read vat audit"
ON public.vat_audit_transactions
FOR SELECT
USING (
  public.is_platform_admin()
  OR (
    public.has_module_permission('Reports', 'view')
    AND business_id = public.get_user_business_id()
  )
);

DROP POLICY IF EXISTS "Staff create vat audit" ON public.vat_audit_transactions;
CREATE POLICY "Staff create vat audit"
ON public.vat_audit_transactions
FOR INSERT
WITH CHECK (
  public.is_platform_admin()
  OR (
    (
      public.has_module_permission('POS', 'add')
      OR public.has_module_permission('Purchases', 'add')
    )
    AND business_id = public.get_user_business_id()
  )
);

DROP POLICY IF EXISTS "Admins manage vat audit" ON public.vat_audit_transactions;
CREATE POLICY "Admins manage vat audit"
ON public.vat_audit_transactions
FOR ALL
USING (
  public.is_platform_admin()
  OR (
    public.get_user_role() = 'admin'
    AND business_id = public.get_user_business_id()
  )
)
WITH CHECK (
  public.is_platform_admin()
  OR (
    public.get_user_role() = 'admin'
    AND business_id = public.get_user_business_id()
  )
);
