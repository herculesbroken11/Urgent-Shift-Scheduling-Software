
-- Allow any authenticated user to create an agency (during onboarding)
CREATE POLICY "Authenticated users can create agencies"
  ON public.agencies FOR INSERT TO authenticated
  WITH CHECK (true);

-- Allow agency admins to update their agency
CREATE POLICY "Admins can update their agency"
  ON public.agencies FOR UPDATE TO authenticated
  USING (id = public.get_user_agency_id(auth.uid()) AND public.has_role(auth.uid(), 'agency_admin'));

-- Allow the trigger function to insert profiles (service role)
-- Also allow anon/authenticated to read own profile even before agency assignment
CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid());
