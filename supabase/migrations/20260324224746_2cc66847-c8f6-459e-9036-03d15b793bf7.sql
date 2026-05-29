
-- Tighten the join_requests INSERT policy: user can only create requests with their own email
DROP POLICY IF EXISTS "Anyone can create join requests" ON public.join_requests;
CREATE POLICY "Users can create own join requests"
  ON public.join_requests FOR INSERT TO authenticated
  WITH CHECK (
    email = (SELECT email FROM public.profiles WHERE id = auth.uid() LIMIT 1)
  );
