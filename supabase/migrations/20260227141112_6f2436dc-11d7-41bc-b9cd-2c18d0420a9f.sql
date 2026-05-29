
-- Tighten the INSERT policy: only allow inserts from authenticated context
-- (the trigger runs as SECURITY DEFINER so this is just a safety belt)
DROP POLICY "System can insert appointment history" ON public.appointment_history;

CREATE POLICY "Trigger can insert appointment history"
  ON public.appointment_history
  FOR INSERT
  WITH CHECK (agency_id = get_user_agency_id(auth.uid()));
