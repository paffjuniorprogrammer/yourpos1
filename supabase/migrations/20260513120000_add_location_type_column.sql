-- Add a missing type column to the locations table
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS type text DEFAULT 'branch';
UPDATE public.locations SET type = 'branch' WHERE type IS NULL;
