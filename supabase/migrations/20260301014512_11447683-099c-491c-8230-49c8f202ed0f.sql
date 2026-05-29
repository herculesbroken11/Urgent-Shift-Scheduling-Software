
CREATE POLICY "Requesters can update own appointments"
ON public.appointments
FOR UPDATE
USING (
  requester_id = auth.uid()
  AND agency_id = get_user_agency_id(auth.uid())
  AND has_role(auth.uid(), 'requester'::app_role)
);
