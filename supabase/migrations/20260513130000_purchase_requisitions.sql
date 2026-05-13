-- Migration: Purchase Requisitions
-- Description: Adds tables and logic for purchase requisitions

CREATE TABLE IF NOT EXISTS public.purchase_requisitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requisition_number SERIAL UNIQUE,
    location_id UUID REFERENCES public.locations(id) ON DELETE CASCADE,
    supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'converted', 'cancelled')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.purchase_requisition_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requisition_id UUID REFERENCES public.purchase_requisitions(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    quantity NUMERIC NOT NULL CHECK (quantity > 0),
    unit_cost NUMERIC NOT NULL CHECK (unit_cost >= 0),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.purchase_requisitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_requisition_items ENABLE ROW LEVEL SECURITY;

-- Basic RLS Policies
CREATE POLICY "Users can view requisitions for their business"
    ON public.purchase_requisitions FOR SELECT
    USING (business_id IN (
        SELECT business_id FROM public.users WHERE auth_user_id = auth.uid()
    ));

CREATE POLICY "Users can create requisitions for their business"
    ON public.purchase_requisitions FOR INSERT
    WITH CHECK (business_id IN (
        SELECT business_id FROM public.users WHERE auth_user_id = auth.uid()
    ));

CREATE POLICY "Users can update requisitions for their business"
    ON public.purchase_requisitions FOR UPDATE
    USING (business_id IN (
        SELECT business_id FROM public.users WHERE auth_user_id = auth.uid()
    ));

CREATE POLICY "Users can delete requisitions for their business"
    ON public.purchase_requisitions FOR DELETE
    USING (business_id IN (
        SELECT business_id FROM public.users WHERE auth_user_id = auth.uid()
    ));

-- Items policies
CREATE POLICY "Users can view requisition items"
    ON public.purchase_requisition_items FOR SELECT
    USING (requisition_id IN (
        SELECT id FROM public.purchase_requisitions
    ));

CREATE POLICY "Users can manage requisition items"
    ON public.purchase_requisition_items FOR ALL
    USING (requisition_id IN (
        SELECT id FROM public.purchase_requisitions
    ));

-- RPC to create requisition
CREATE OR REPLACE FUNCTION public.create_purchase_requisition(
    p_location_id UUID,
    p_supplier_id UUID,
    p_notes TEXT,
    p_created_by UUID,
    p_items JSONB
) RETURNS UUID AS $$
DECLARE
    v_requisition_id UUID;
    v_business_id UUID;
    v_item JSONB;
BEGIN
    -- Get business_id from user
    SELECT business_id INTO v_business_id FROM public.users WHERE id = p_created_by;
    
    -- Create requisition
    INSERT INTO public.purchase_requisitions (
        location_id,
        supplier_id,
        notes,
        created_by,
        business_id
    ) VALUES (
        p_location_id,
        p_supplier_id,
        p_notes,
        p_created_by,
        v_business_id
    ) RETURNING id INTO v_requisition_id;
    
    -- Create items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        INSERT INTO public.purchase_requisition_items (
            requisition_id,
            product_id,
            quantity,
            unit_cost,
            notes
        ) VALUES (
            v_requisition_id,
            (v_item->>'product_id')::UUID,
            (v_item->>'quantity')::NUMERIC,
            (v_item->>'unit_cost')::NUMERIC,
            v_item->>'notes'
        );
    END LOOP;
    
    RETURN v_requisition_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
