-- Track the actual register opening time so close-day totals resume correctly
-- while the shift is open, then reset after the day is closed and opened again.

ALTER TABLE public.day_closures
ADD COLUMN IF NOT EXISTS opened_at timestamptz;

ALTER TABLE public.day_closures
DROP CONSTRAINT IF EXISTS day_closures_user_id_closing_date_location_id_key;

UPDATE public.day_closures
SET opened_at = COALESCE(opened_at, created_at)
WHERE opened_at IS NULL;

WITH ranked_open_shifts AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id, location_id
      ORDER BY COALESCE(opened_at, created_at) DESC, created_at DESC, id DESC
    ) AS shift_rank
  FROM public.day_closures
  WHERE status = 'open'
)
UPDATE public.day_closures dc
SET
  status = 'closed',
  closed_at = COALESCE(dc.closed_at, dc.opened_at, dc.created_at),
  total_amount = COALESCE(dc.total_amount, 0)
FROM ranked_open_shifts ranked
WHERE dc.id = ranked.id
  AND ranked.shift_rank > 1;

CREATE INDEX IF NOT EXISTS idx_day_closures_open_shift
ON public.day_closures(user_id, location_id, closing_date, status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_day_closures_one_open_shift
ON public.day_closures(user_id, location_id)
WHERE status = 'open';
