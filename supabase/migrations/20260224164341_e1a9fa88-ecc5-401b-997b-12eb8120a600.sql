
-- Drop the overly permissive policy
DROP POLICY "Authenticated users can create agencies" ON public.agencies;

-- Only allow users without an existing agency to create one
CREATE POLICY "Users without agency can create one"
  ON public.agencies FOR INSERT TO authenticated
  WITH CHECK (public.get_user_agency_id(auth.uid()) IS NULL);
