-- Harden onboarding bootstrap insert policy for agencies
-- Use security-definer helper to avoid policy-time cross-table RLS edge cases
DROP POLICY IF EXISTS "Users without agency can create one" ON public.agencies;

CREATE POLICY "Users without agency can create one"
ON public.agencies
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND get_user_agency_id(auth.uid()) IS NULL
);