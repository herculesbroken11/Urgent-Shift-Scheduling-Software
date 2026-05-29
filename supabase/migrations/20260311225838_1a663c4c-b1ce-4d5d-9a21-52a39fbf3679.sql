
-- Fix interpreter self-claim: update USING to allow claiming unclaimed self-claimable jobs.
DROP POLICY IF EXISTS "Interpreters can update assigned appointments" ON public.appointments;

CREATE POLICY "Interpreters can update assigned appointments"
ON public.appointments
FOR UPDATE
TO authenticated
USING (
  (agency_id = get_user_agency_id(auth.uid()))
  AND has_role(auth.uid(), 'interpreter'::app_role)
  AND (
    interpreter_id = auth.uid()
    OR (interpreter_id IS NULL AND is_self_claimable = true)
  )
)
WITH CHECK (
  (agency_id = get_user_agency_id(auth.uid()))
  AND (
    (interpreter_id = auth.uid())
    OR (interpreter_id IS NULL AND status = 'pending'::appointment_status)
  )
);
