
-- Interpreter availability windows (recurring and one-time)
CREATE TABLE public.interpreter_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interpreter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  day_of_week smallint, -- 0=Sun..6=Sat, NULL for one-time
  start_time time NOT NULL,
  end_time time NOT NULL,
  specific_date date, -- non-null for one-time availability
  is_recurring boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.interpreter_availability ENABLE ROW LEVEL SECURITY;

-- Interpreters can manage their own availability
CREATE POLICY "Interpreters manage own availability"
  ON public.interpreter_availability FOR ALL
  USING (interpreter_id = auth.uid())
  WITH CHECK (interpreter_id = auth.uid());

-- Agency members can view interpreter availability
CREATE POLICY "Agency members view availability"
  ON public.interpreter_availability FOR SELECT
  USING (agency_id = get_user_agency_id(auth.uid()));
