-- Drop the old requester update policy
DROP POLICY IF EXISTS "Requesters can update own appointments" ON public.appointments;

-- Create new policy: requesters can update any appointment belonging to their customer
CREATE POLICY "Requesters can update customer appointments"
ON public.appointments
FOR UPDATE
TO authenticated
USING (
  agency_id = get_user_agency_id(auth.uid())
  AND has_role(auth.uid(), 'requester'::app_role)
  AND customer_id IS NOT NULL
  AND customer_id = get_user_customer_id(auth.uid())
)
WITH CHECK (
  agency_id = get_user_agency_id(auth.uid())
  AND customer_id IS NOT NULL
  AND customer_id = get_user_customer_id(auth.uid())
);