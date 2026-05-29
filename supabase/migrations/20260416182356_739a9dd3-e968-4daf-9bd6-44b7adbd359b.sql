CREATE POLICY "Requesters can add locations for their customer"
ON public.locations
FOR INSERT
TO authenticated
WITH CHECK (
  agency_id = get_user_agency_id(auth.uid())
  AND has_role(auth.uid(), 'requester'::app_role)
  AND customer_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.customer_requestors cr
    WHERE cr.user_id = auth.uid()
      AND cr.customer_id = locations.customer_id
      AND cr.agency_id = locations.agency_id
      AND cr.is_active = true
      AND cr.is_deleted = false
  )
);