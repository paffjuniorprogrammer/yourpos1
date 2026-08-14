-- Migration: Add credit_limit and discount_percentage to customers table

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS credit_limit NUMERIC DEFAULT NULL;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS discount_percentage NUMERIC(5,2) DEFAULT 0;
