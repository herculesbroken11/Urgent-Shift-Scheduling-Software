-- Fix onboarding bootstrap RLS rules
-- 1) Agency creation: only allow users with a profile and no agency yet
DROP POLICY IF EXISTS "Users without agency can create one" ON public.agencies;
CREATE POLICY "Users without agency can create one"
ON public.agencies
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.agency_id IS NULL
  )
);

-- 2) First role bootstrap: allow a user to create their own initial agency_admin role
-- after profile.agency_id is set and before any admin role exists
DROP POLICY IF EXISTS "Users can bootstrap own admin role" ON public.user_roles;
CREATE POLICY "Users can bootstrap own admin role"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND role = 'agency_admin'::app_role
  AND agency_id = get_user_agency_id(auth.uid())
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
  )
);