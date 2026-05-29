
-- 1. Enforce only one default billing rate per agency
CREATE UNIQUE INDEX IF NOT EXISTS uq_billing_rates_one_default_per_agency
ON public.billing_rates (agency_id)
WHERE is_default = true AND customer_id IS NULL;

-- 2. Enforce only one default interpreter pay package per agency
CREATE UNIQUE INDEX IF NOT EXISTS uq_interpreter_pay_rates_one_default_per_agency
ON public.interpreter_pay_rates (agency_id)
WHERE is_default = true AND interpreter_id IS NULL;

-- 3. Prevent orphan billing bundles (non-default without customer)
CREATE OR REPLACE FUNCTION public.validate_billing_rate_customer()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_default = false AND NEW.customer_id IS NULL THEN
    RAISE EXCEPTION 'Non-default billing bundles must have a customer_id assigned';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_billing_rate_customer ON public.billing_rates;
CREATE TRIGGER trg_validate_billing_rate_customer
  BEFORE INSERT OR UPDATE ON public.billing_rates
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_billing_rate_customer();

-- 4. Prevent orphan interpreter pay packages (non-default without interpreter)
CREATE OR REPLACE FUNCTION public.validate_pay_rate_interpreter()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_default = false AND NEW.interpreter_id IS NULL THEN
    RAISE EXCEPTION 'Non-default pay packages must have an interpreter_id assigned';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_pay_rate_interpreter ON public.interpreter_pay_rates;
CREATE TRIGGER trg_validate_pay_rate_interpreter
  BEFORE INSERT OR UPDATE ON public.interpreter_pay_rates
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_pay_rate_interpreter();

-- 5. Prevent duplicate bundle names per agency (for billing_rates)
CREATE UNIQUE INDEX IF NOT EXISTS uq_billing_rates_name_per_agency
ON public.billing_rates (agency_id, name);

-- 6. Prevent duplicate package names per agency (for interpreter_pay_rates)
CREATE UNIQUE INDEX IF NOT EXISTS uq_pay_rates_name_per_agency
ON public.interpreter_pay_rates (agency_id, name);

-- 7. Add index for import idempotency lookups
CREATE INDEX IF NOT EXISTS idx_appointments_source_lookup
ON public.appointments (agency_id, source_system, source_record_id)
WHERE source_record_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customers_source_lookup
ON public.customers (agency_id, source_system, source_record_id)
WHERE source_record_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_locations_source_lookup
ON public.locations (agency_id, source_system, source_record_id)
WHERE source_record_id IS NOT NULL;
