-- Safe for projects where the earlier customer-credit migration was not run.
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS credit_limit numeric DEFAULT NULL;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS discount_percentage numeric(5,2) NOT NULL DEFAULT 0;
