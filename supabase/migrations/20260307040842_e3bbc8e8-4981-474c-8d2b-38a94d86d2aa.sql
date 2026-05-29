
-- Add recurring appointment support columns
ALTER TABLE public.appointments 
  ADD COLUMN IF NOT EXISTS parent_recurring_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recurrence_rule jsonb DEFAULT NULL;

-- Index for fast series lookups
CREATE INDEX IF NOT EXISTS idx_appointments_parent_recurring_id ON public.appointments(parent_recurring_id);
