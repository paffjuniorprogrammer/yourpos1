-- Phase 4: Attribute Manager & Product Variants
-- Enables complex product variants like Size, Color, etc.

-- 1. Create Tables for Attribute Management
CREATE TABLE IF NOT EXISTS public.product_attributes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    name text NOT NULL, -- e.g. "Size", "Color"
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(business_id, name)
);

CREATE TABLE IF NOT EXISTS public.product_attribute_values (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    attribute_id uuid NOT NULL REFERENCES public.product_attributes(id) ON DELETE CASCADE,
    value text NOT NULL, -- e.g. "Small", "Large", "Red"
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(attribute_id, value)
);

-- 2. Update Products table to support Variants
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.products(id) ON DELETE CASCADE;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_parent boolean NOT NULL DEFAULT false;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS variant_combination jsonb; -- e.g. {"Size": "Large", "Color": "Blue"}

-- 3. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_products_parent_id ON public.products(parent_id);
CREATE INDEX IF NOT EXISTS idx_products_is_parent ON public.products(is_parent);

-- 4. RLS Policies
ALTER TABLE public.product_attributes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_attribute_values ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read attributes" ON public.product_attributes;
CREATE POLICY "Staff read attributes" ON public.product_attributes FOR SELECT 
USING (business_id = public.get_user_business_id() OR public.is_platform_admin());

DROP POLICY IF EXISTS "Staff manage attributes" ON public.product_attributes;
CREATE POLICY "Staff manage attributes" ON public.product_attributes FOR ALL
USING (business_id = public.get_user_business_id() OR public.is_platform_admin());

DROP POLICY IF EXISTS "Staff read values" ON public.product_attribute_values;
CREATE POLICY "Staff read values" ON public.product_attribute_values FOR SELECT 
USING (
    EXISTS (SELECT 1 FROM public.product_attributes a WHERE a.id = attribute_id AND (a.business_id = public.get_user_business_id() OR public.is_platform_admin()))
);

DROP POLICY IF EXISTS "Staff manage values" ON public.product_attribute_values;
CREATE POLICY "Staff manage values" ON public.product_attribute_values FOR ALL
USING (
    EXISTS (SELECT 1 FROM public.product_attributes a WHERE a.id = attribute_id AND (a.business_id = public.get_user_business_id() OR public.is_platform_admin()))
);

-- 5. Trigger for automatic business scoping (matching existing patterns)
DROP TRIGGER IF EXISTS trg_set_business_id_attributes ON public.product_attributes;
CREATE TRIGGER trg_set_business_id_attributes BEFORE INSERT ON public.product_attributes FOR EACH ROW EXECUTE FUNCTION public.set_business_id_from_context();
