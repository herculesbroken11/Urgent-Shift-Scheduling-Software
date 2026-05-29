
-- Audit log table for appointment changes
CREATE TABLE public.appointment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  changed_by uuid REFERENCES public.profiles(id),
  action text NOT NULL, -- 'INSERT', 'UPDATE', 'DELETE'
  old_data jsonb,
  new_data jsonb,
  changed_fields text[], -- list of columns that changed
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_appointment_history_appointment ON public.appointment_history(appointment_id);
CREATE INDEX idx_appointment_history_agency ON public.appointment_history(agency_id);
CREATE INDEX idx_appointment_history_created ON public.appointment_history(created_at DESC);

-- Enable RLS
ALTER TABLE public.appointment_history ENABLE ROW LEVEL SECURITY;

-- Admins can view audit log
CREATE POLICY "Admins can view appointment history"
  ON public.appointment_history
  FOR SELECT
  USING (
    agency_id = get_user_agency_id(auth.uid())
    AND has_role(auth.uid(), 'agency_admin'::app_role)
  );

-- System can insert (trigger runs as definer)
CREATE POLICY "System can insert appointment history"
  ON public.appointment_history
  FOR INSERT
  WITH CHECK (true);

-- Trigger function to auto-log appointment changes
CREATE OR REPLACE FUNCTION public.log_appointment_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _changed text[] := '{}';
  _action text;
  _old jsonb;
  _new jsonb;
  _agency uuid;
  _appt_id uuid;
  _user uuid;
BEGIN
  _user := auth.uid();

  IF TG_OP = 'DELETE' THEN
    _action := 'DELETE';
    _old := to_jsonb(OLD);
    _new := NULL;
    _agency := OLD.agency_id;
    _appt_id := OLD.id;
  ELSIF TG_OP = 'INSERT' THEN
    _action := 'INSERT';
    _old := NULL;
    _new := to_jsonb(NEW);
    _agency := NEW.agency_id;
    _appt_id := NEW.id;
  ELSE
    _action := 'UPDATE';
    _old := to_jsonb(OLD);
    _new := to_jsonb(NEW);
    _agency := NEW.agency_id;
    _appt_id := NEW.id;

    -- Detect changed fields
    SELECT array_agg(key) INTO _changed
    FROM jsonb_each(_new) n
    WHERE n.value IS DISTINCT FROM (_old -> n.key);
  END IF;

  INSERT INTO public.appointment_history (appointment_id, agency_id, changed_by, action, old_data, new_data, changed_fields)
  VALUES (_appt_id, _agency, _user, _action, _old, _new, _changed);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Attach trigger to appointments table
CREATE TRIGGER trg_appointment_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.log_appointment_change();
