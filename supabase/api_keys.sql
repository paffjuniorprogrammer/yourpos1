-- Phase 4: API Access Layer
-- Allows businesses to generate secure keys for external integrations.

CREATE TABLE IF NOT EXISTS public.api_keys (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    name text NOT NULL, -- e.g. "Shopify Sync", "Mobile App"
    key_hash text NOT NULL UNIQUE,
    key_prefix text NOT NULL, -- e.g. "ag_live_"
    is_active boolean NOT NULL DEFAULT true,
    last_used_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz
);

-- RLS
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage api_keys" ON public.api_keys;
CREATE POLICY "Admins can manage api_keys" ON public.api_keys FOR ALL USING (
    business_id = public.get_user_business_id()
    AND public.get_user_role() = 'admin'
);

-- Index for lookup
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON public.api_keys(key_hash);

-- Function to set business_id on insert
DROP TRIGGER IF EXISTS trg_set_business_id_api_keys ON public.api_keys;
CREATE TRIGGER trg_set_business_id_api_keys BEFORE INSERT ON public.api_keys FOR EACH ROW EXECUTE FUNCTION public.set_business_id_from_context();
