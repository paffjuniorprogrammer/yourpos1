-- Phase 4: Subscription Auto-Expiry via DB Cron
-- Automatically marks businesses as 'expired' when their subscription ends.

-- 1. Create the auditing function
CREATE OR REPLACE FUNCTION public.check_subscription_expiries()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Mark active businesses as expired if their end date has passed
  UPDATE public.businesses
  SET status = 'expired'
  WHERE status = 'active'
    AND subscription_end_date IS NOT NULL
    AND subscription_end_date < NOW();
    
  -- Log the action (optional, assuming an audit_logs table exists or just for tracking)
  -- RAISE NOTICE 'Subscription audit complete';
END;
$$;

-- 2. Schedule the job (Requires pg_cron extension to be enabled in Supabase)
-- This will run every day at midnight (00:00)
-- Note: 'cron' must be in the 'search_path' or the extension must be enabled.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        -- Schedule the job
        PERFORM cron.schedule(
            'audit-subscriptions-daily', -- unique job name
            '0 0 * * *',                -- cron expression (daily at midnight)
            'SELECT public.check_subscription_expiries()'
        );
    END IF;
END $$;

-- 3. Also add a trigger to check on every login/update for safety (optional but recommended for robustness)
-- This ensures that even if cron fails, the first action taken by someone in that business will trigger the expiry check.
CREATE OR REPLACE FUNCTION public.trg_check_expiry_on_interaction()
RETURNS trigger AS $$
BEGIN
    IF NEW.subscription_end_date IS NOT NULL AND NEW.subscription_end_date < NOW() AND NEW.status = 'active' THEN
        NEW.status := 'expired';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_expire_subscription ON public.businesses;
CREATE TRIGGER trg_auto_expire_subscription
BEFORE UPDATE ON public.businesses
FOR EACH ROW
WHEN (OLD.status = 'active')
EXECUTE FUNCTION public.trg_check_expiry_on_interaction();
