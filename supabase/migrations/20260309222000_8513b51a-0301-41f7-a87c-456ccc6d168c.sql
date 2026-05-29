
-- Fix: Add WITH CHECK to requester update policy
-- Prevents requesters from reassigning ownership, customer, or agency
DROP POLICY IF EXISTS "Requesters can update own appointments" ON public.appointments;

CREATE POLICY "Requesters can update own appointments"
  ON public.appointments FOR UPDATE
  TO authenticated
  USING (
    requester_id = auth.uid()
    AND agency_id = get_user_agency_id(auth.uid())
    AND has_role(auth.uid(), 'requester'::app_role)
  )
  WITH CHECK (
    requester_id = auth.uid()
    AND agency_id = get_user_agency_id(auth.uid())
    AND (customer_id IS NULL OR customer_id = get_user_customer_id(auth.uid()))
  );
