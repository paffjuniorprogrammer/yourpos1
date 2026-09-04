ALTER TABLE public.printer_configurations
  ADD COLUMN IF NOT EXISTS auto_print boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS print_mode text NOT NULL DEFAULT 'full'
    CHECK (print_mode IN ('full', 'drinks_only'));

NOTIFY pgrst, 'reload schema';
