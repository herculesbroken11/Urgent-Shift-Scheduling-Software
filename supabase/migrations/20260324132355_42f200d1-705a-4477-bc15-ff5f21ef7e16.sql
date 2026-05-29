
-- Add new columns to billing_rates for the full rate engine
ALTER TABLE public.billing_rates
  ADD COLUMN IF NOT EXISTS billing_model text NOT NULL DEFAULT 'hourly',
  ADD COLUMN IF NOT EXISTS base_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS minimum_charge numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monthly_minimum numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS travel_time_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS after_hours_multiplier numeric NOT NULL DEFAULT 1.5,
  ADD COLUMN IF NOT EXISTS weekend_multiplier numeric NOT NULL DEFAULT 1.5,
  ADD COLUMN IF NOT EXISTS tier_config jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS effective_start_date date,
  ADD COLUMN IF NOT EXISTS effective_end_date date;

-- Add billing breakdown fields to appointments
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS billed_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS interpreter_pay_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS billing_breakdown jsonb DEFAULT '{}'::jsonb;
