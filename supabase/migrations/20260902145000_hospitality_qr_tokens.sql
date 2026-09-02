-- Stable, non-guessable identifiers for customer-facing table and room QR codes.
-- The customer-order page will validate these tokens before it exposes a menu.

ALTER TABLE public.dining_tables ADD COLUMN IF NOT EXISTS qr_token text;
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS qr_token text;

UPDATE public.dining_tables
SET qr_token = replace(gen_random_uuid()::text, '-', '')
WHERE qr_token IS NULL OR qr_token = '';

UPDATE public.rooms
SET qr_token = replace(gen_random_uuid()::text, '-', '')
WHERE qr_token IS NULL OR qr_token = '';

ALTER TABLE public.dining_tables ALTER COLUMN qr_token SET NOT NULL;
ALTER TABLE public.rooms ALTER COLUMN qr_token SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS dining_tables_qr_token_key ON public.dining_tables(qr_token);
CREATE UNIQUE INDEX IF NOT EXISTS rooms_qr_token_key ON public.rooms(qr_token);

CREATE OR REPLACE FUNCTION public.set_hospitality_qr_token()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.qr_token IS NULL OR NEW.qr_token = '' THEN
    NEW.qr_token := replace(gen_random_uuid()::text, '-', '');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dining_tables_qr_token ON public.dining_tables;
CREATE TRIGGER trg_dining_tables_qr_token
BEFORE INSERT ON public.dining_tables
FOR EACH ROW EXECUTE FUNCTION public.set_hospitality_qr_token();

DROP TRIGGER IF EXISTS trg_rooms_qr_token ON public.rooms;
CREATE TRIGGER trg_rooms_qr_token
BEFORE INSERT ON public.rooms
FOR EACH ROW EXECUTE FUNCTION public.set_hospitality_qr_token();

NOTIFY pgrst, 'reload schema';
