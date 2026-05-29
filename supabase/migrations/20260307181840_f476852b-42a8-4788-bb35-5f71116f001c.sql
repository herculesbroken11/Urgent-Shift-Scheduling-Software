
-- Drop the existing interpreter update policy
DROP POLICY IF EXISTS "Interpreters can update assigned appointments" ON public.appointments;

-- Recreate with a WITH CHECK that allows setting interpreter_id to null (rejection)
CREATE POLICY "Interpreters can update assigned appointments"
ON public.appointments
FOR UPDATE
TO authenticated
USING (
  (interpreter_id = auth.uid()) AND (agency_id = get_user_agency_id(auth.uid()))
)
WITH CHECK (
  (agency_id = get_user_agency_id(auth.uid()))
  AND (
    -- Normal updates: interpreter stays assigned
    (interpreter_id = auth.uid())
    OR
    -- Rejection: interpreter clears themselves and sets back to pending
    (interpreter_id IS NULL AND status = 'pending'::appointment_status)
  )
);
