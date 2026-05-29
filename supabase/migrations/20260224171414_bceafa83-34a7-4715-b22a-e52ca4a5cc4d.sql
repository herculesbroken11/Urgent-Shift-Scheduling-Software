
-- Fix: Change all RESTRICTIVE policies to PERMISSIVE

-- agencies
DROP POLICY IF EXISTS "Users without agency can create one" ON public.agencies;
CREATE POLICY "Users without agency can create one" ON public.agencies
  FOR INSERT TO authenticated
  WITH CHECK (get_user_agency_id(auth.uid()) IS NULL);

DROP POLICY IF EXISTS "Users can view their own agency" ON public.agencies;
CREATE POLICY "Users can view their own agency" ON public.agencies
  FOR SELECT TO authenticated
  USING (id = get_user_agency_id(auth.uid()));

DROP POLICY IF EXISTS "Admins can update their agency" ON public.agencies;
CREATE POLICY "Admins can update their agency" ON public.agencies
  FOR UPDATE TO authenticated
  USING (id = get_user_agency_id(auth.uid()) AND has_role(auth.uid(), 'agency_admin'));

-- profiles
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY "Users can read own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS "Users can view profiles in their agency" ON public.profiles;
CREATE POLICY "Users can view profiles in their agency" ON public.profiles
  FOR SELECT TO authenticated
  USING (agency_id = get_user_agency_id(auth.uid()));

-- user_roles
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
CREATE POLICY "Admins can manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'agency_admin') AND agency_id = get_user_agency_id(auth.uid()));

DROP POLICY IF EXISTS "Users can view roles in their agency" ON public.user_roles;
CREATE POLICY "Users can view roles in their agency" ON public.user_roles
  FOR SELECT TO authenticated
  USING (agency_id = get_user_agency_id(auth.uid()));

-- customers
DROP POLICY IF EXISTS "Admins and schedulers can manage customers" ON public.customers;
CREATE POLICY "Admins and schedulers can manage customers" ON public.customers
  FOR ALL TO authenticated
  USING (agency_id = get_user_agency_id(auth.uid()) AND (has_role(auth.uid(), 'agency_admin') OR has_role(auth.uid(), 'scheduler')));

DROP POLICY IF EXISTS "Agency members can view customers" ON public.customers;
CREATE POLICY "Agency members can view customers" ON public.customers
  FOR SELECT TO authenticated
  USING (agency_id = get_user_agency_id(auth.uid()));

-- locations
DROP POLICY IF EXISTS "Admins and schedulers can manage locations" ON public.locations;
CREATE POLICY "Admins and schedulers can manage locations" ON public.locations
  FOR ALL TO authenticated
  USING (agency_id = get_user_agency_id(auth.uid()) AND (has_role(auth.uid(), 'agency_admin') OR has_role(auth.uid(), 'scheduler')));

DROP POLICY IF EXISTS "Agency members can view locations" ON public.locations;
CREATE POLICY "Agency members can view locations" ON public.locations
  FOR SELECT TO authenticated
  USING (agency_id = get_user_agency_id(auth.uid()));

-- appointments
DROP POLICY IF EXISTS "Admins and schedulers can manage appointments" ON public.appointments;
CREATE POLICY "Admins and schedulers can manage appointments" ON public.appointments
  FOR ALL TO authenticated
  USING (agency_id = get_user_agency_id(auth.uid()) AND (has_role(auth.uid(), 'agency_admin') OR has_role(auth.uid(), 'scheduler')));

DROP POLICY IF EXISTS "Agency members can view appointments" ON public.appointments;
CREATE POLICY "Agency members can view appointments" ON public.appointments
  FOR SELECT TO authenticated
  USING (agency_id = get_user_agency_id(auth.uid()));

DROP POLICY IF EXISTS "Interpreters can update assigned appointments" ON public.appointments;
CREATE POLICY "Interpreters can update assigned appointments" ON public.appointments
  FOR UPDATE TO authenticated
  USING (interpreter_id = auth.uid() AND agency_id = get_user_agency_id(auth.uid()));

DROP POLICY IF EXISTS "Requesters can insert appointments" ON public.appointments;
CREATE POLICY "Requesters can insert appointments" ON public.appointments
  FOR INSERT TO authenticated
  WITH CHECK (agency_id = get_user_agency_id(auth.uid()) AND has_role(auth.uid(), 'requester'));

-- interpreter_languages
DROP POLICY IF EXISTS "Agency members can view interpreter languages" ON public.interpreter_languages;
CREATE POLICY "Agency members can view interpreter languages" ON public.interpreter_languages
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = interpreter_languages.interpreter_id AND p.agency_id = get_user_agency_id(auth.uid())));

DROP POLICY IF EXISTS "Interpreters can manage own languages" ON public.interpreter_languages;
CREATE POLICY "Interpreters can manage own languages" ON public.interpreter_languages
  FOR ALL TO authenticated
  USING (interpreter_id = auth.uid());

-- languages (already fine but let's ensure permissive)
DROP POLICY IF EXISTS "Anyone can view languages" ON public.languages;
CREATE POLICY "Anyone can view languages" ON public.languages
  FOR SELECT
  USING (true);
