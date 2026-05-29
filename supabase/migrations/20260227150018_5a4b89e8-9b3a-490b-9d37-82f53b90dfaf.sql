
-- Add columns to support all-day blocks and date ranges (vacations)
ALTER TABLE public.interpreter_availability
  ADD COLUMN IF NOT EXISTS is_all_day boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS end_date date NULL;

-- Add a comment for clarity
COMMENT ON COLUMN public.interpreter_availability.end_date IS 'For multi-day blocks like vacations. Combined with specific_date as start_date.';
COMMENT ON COLUMN public.interpreter_availability.is_all_day IS 'When true, the block covers the entire day(s).';
