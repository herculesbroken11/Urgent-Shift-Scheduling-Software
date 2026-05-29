CREATE POLICY "Requesters can self-link to created locations"
ON public.requestor_locations
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.customer_requestors cr
    WHERE cr.id = requestor_locations.customer_requestor_id
      AND cr.user_id = auth.uid()
      AND cr.is_active = true
      AND cr.is_deleted = false
  )
);