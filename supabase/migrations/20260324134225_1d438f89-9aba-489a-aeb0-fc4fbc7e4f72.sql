
-- Platform billing config per agency
CREATE TABLE public.platform_billing_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  billing_model text NOT NULL DEFAULT 'per_appointment',
  per_appointment_fee numeric NOT NULL DEFAULT 0,
  monthly_base_fee numeric NOT NULL DEFAULT 0,
  included_appointments integer NOT NULL DEFAULT 0,
  overage_rate numeric NOT NULL DEFAULT 0,
  usage_billing_trigger text NOT NULL DEFAULT 'completed',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(agency_id),
  CONSTRAINT valid_billing_model CHECK (billing_model IN ('per_appointment', 'flat_monthly', 'tiered', 'custom')),
  CONSTRAINT valid_usage_trigger CHECK (usage_billing_trigger IN ('booked', 'completed'))
);

ALTER TABLE public.platform_billing_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform owners manage billing config"
  ON public.platform_billing_config FOR ALL
  TO authenticated
  USING (is_platform_owner(auth.uid()))
  WITH CHECK (is_platform_owner(auth.uid()));

-- Platform usage log (idempotent per appointment)
CREATE TABLE public.platform_usage_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  trigger_type text NOT NULL,
  triggered_status text NOT NULL,
  fee_amount numeric NOT NULL DEFAULT 0,
  billing_month text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(appointment_id)
);

ALTER TABLE public.platform_usage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform owners view usage log"
  ON public.platform_usage_log FOR ALL
  TO authenticated
  USING (is_platform_owner(auth.uid()))
  WITH CHECK (is_platform_owner(auth.uid()));

-- Trigger function to record usage on appointment status change
CREATE OR REPLACE FUNCTION public.record_platform_usage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _config record;
  _fee numeric;
  _trigger_statuses text[];
  _month text;
BEGIN
  -- Only fire on status change
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  -- Skip staged/deleted
  IF NEW.is_import_staged OR NEW.is_deleted THEN RETURN NEW; END IF;

  -- Get billing config for this agency
  SELECT * INTO _config FROM platform_billing_config WHERE agency_id = NEW.agency_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Determine which statuses trigger usage
  IF _config.usage_billing_trigger = 'booked' THEN
    _trigger_statuses := ARRAY['scheduled', 'confirmed', 'offered'];
  ELSE
    _trigger_statuses := ARRAY['completed', 'validated', 'billed'];
  END IF;

  -- Check if the new status is a trigger status
  IF NOT (NEW.status::text = ANY(_trigger_statuses)) THEN RETURN NEW; END IF;

  -- Idempotency: skip if already recorded
  IF EXISTS (SELECT 1 FROM platform_usage_log WHERE appointment_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  -- Calculate fee
  _fee := _config.per_appointment_fee;
  _month := to_char(COALESCE(NEW.scheduled_start, now()), 'YYYY-MM');

  INSERT INTO platform_usage_log (agency_id, appointment_id, trigger_type, triggered_status, fee_amount, billing_month)
  VALUES (NEW.agency_id, NEW.id, _config.usage_billing_trigger, NEW.status::text, _fee, _month);

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_platform_usage
  AFTER UPDATE ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.record_platform_usage();

-- Updated at trigger for platform_billing_config
CREATE TRIGGER update_platform_billing_config_updated_at
  BEFORE UPDATE ON public.platform_billing_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
