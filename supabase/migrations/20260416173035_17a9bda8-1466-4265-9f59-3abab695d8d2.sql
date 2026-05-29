
-- Drop the overly restrictive INSERT policy
DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;

-- Allow any authenticated user in the same agency to insert notifications
CREATE POLICY "Agency members can insert notifications"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (agency_id = get_user_agency_id(auth.uid()));
