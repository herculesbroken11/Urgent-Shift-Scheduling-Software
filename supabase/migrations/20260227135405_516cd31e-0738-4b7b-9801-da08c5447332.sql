
-- Add signature and parking cost columns to appointments
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS signature_data text,
  ADD COLUMN IF NOT EXISTS signature_timestamp timestamp with time zone,
  ADD COLUMN IF NOT EXISTS signature_lat numeric,
  ADD COLUMN IF NOT EXISTS signature_lng numeric,
  ADD COLUMN IF NOT EXISTS parking_cost numeric DEFAULT 0;

-- Create billing_rules table for conditional rate modifiers
CREATE TABLE public.billing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id),
  name text NOT NULL,
  rule_type text NOT NULL, -- 'time_of_day', 'weekend', 'holiday', 'last_minute', 'language'
  trigger_config jsonb NOT NULL DEFAULT '{}',
  modifier_type text NOT NULL DEFAULT 'multiplier', -- 'multiplier' or 'flat_fee'
  modifier_value numeric NOT NULL DEFAULT 1.0,
  language_id uuid REFERENCES public.languages(id),
  is_active boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.billing_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency members can view billing rules"
  ON public.billing_rules FOR SELECT
  USING (agency_id = get_user_agency_id(auth.uid()));

CREATE POLICY "Admins can manage billing rules"
  ON public.billing_rules FOR ALL
  USING (agency_id = get_user_agency_id(auth.uid()) AND has_role(auth.uid(), 'agency_admin'::app_role));

CREATE TRIGGER update_billing_rules_updated_at
  BEFORE UPDATE ON public.billing_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
