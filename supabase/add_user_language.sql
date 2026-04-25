-- Add language preference to profiles
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS language text DEFAULT 'en';

-- Update RLS policies to allow users to update their own language
-- (Assuming public.users already has standard RLS, but just to be safe)
CREATE POLICY "Users can update their own language" 
ON public.users 
FOR UPDATE 
TO authenticated
USING (auth.uid() = auth_user_id)
WITH CHECK (auth.uid() = auth_user_id);
