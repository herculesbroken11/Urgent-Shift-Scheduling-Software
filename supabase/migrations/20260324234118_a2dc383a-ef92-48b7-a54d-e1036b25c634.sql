
ALTER TABLE public.billing_rates
  ADD COLUMN IF NOT EXISTS same_day_threshold_hours integer NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS same_day_fee numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS same_day_multiplier numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS after_hours_start time NOT NULL DEFAULT '18:00',
  ADD COLUMN IF NOT EXISTS after_hours_end time NOT NULL DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS holiday_multiplier numeric NOT NULL DEFAULT 1;
