
-- Add rounding and advanced billing fields to billing_rates
ALTER TABLE public.billing_rates
  ADD COLUMN IF NOT EXISTS rounding_direction text NOT NULL DEFAULT 'up',
  ADD COLUMN IF NOT EXISTS rounding_interval_minutes integer NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS stack_premiums boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS apply_lastminute_to_travel boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ignore_requested_duration boolean NOT NULL DEFAULT false;

-- Create interpreter pay rates table
CREATE TABLE IF NOT EXISTS public.interpreter_pay_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  interpreter_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  pay_model text NOT NULL DEFAULT 'hourly',
  hourly_rate numeric NOT NULL DEFAULT 0,
  minimum_hours numeric NOT NULL DEFAULT 2.00,
  minimum_pay numeric NOT NULL DEFAULT 0,
  overtime_rate numeric NOT NULL DEFAULT 0,
  overtime_after_hours numeric NOT NULL DEFAULT 8,
  travel_rate_per_mile numeric NOT NULL DEFAULT 0,
  travel_time_rate numeric NOT NULL DEFAULT 0,
  after_hours_multiplier numeric NOT NULL DEFAULT 1.0,
  after_hours_start text NOT NULL DEFAULT '18:00',
  after_hours_end text NOT NULL DEFAULT '08:00',
  weekend_multiplier numeric NOT NULL DEFAULT 1.0,
  holiday_multiplier numeric NOT NULL DEFAULT 1.0,
  same_day_multiplier numeric NOT NULL DEFAULT 1.0,
  cancellation_fee_percent numeric NOT NULL DEFAULT 100.00,
  cancellation_window_hours numeric NOT NULL DEFAULT 24,
  rounding_direction text NOT NULL DEFAULT 'up',
  rounding_interval_minutes integer NOT NULL DEFAULT 15,
  is_default boolean NOT NULL DEFAULT false,
  effective_start_date date,
  effective_end_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS for interpreter_pay_rates
ALTER TABLE public.interpreter_pay_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage interpreter pay rates"
  ON public.interpreter_pay_rates
  FOR ALL
  TO authenticated
  USING (agency_id = get_user_agency_id(auth.uid()) AND has_role(auth.uid(), 'agency_admin'::app_role));

CREATE POLICY "Interpreters can view own pay rates"
  ON public.interpreter_pay_rates
  FOR SELECT
  TO authenticated
  USING (interpreter_id = auth.uid());
