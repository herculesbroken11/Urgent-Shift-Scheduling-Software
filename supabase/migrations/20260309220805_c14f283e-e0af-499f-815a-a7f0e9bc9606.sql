
-- ============================================================
-- FIX 1: Prevent users from changing their own agency_id
-- Replace the overly-permissive UPDATE policy on profiles
-- with one that restricts updateable columns via WITH CHECK
-- ============================================================

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND agency_id IS NOT DISTINCT FROM (SELECT p.agency_id FROM public.profiles p WHERE p.id = auth.uid())
    AND customer_id IS NOT DISTINCT FROM (SELECT p.customer_id FROM public.profiles p WHERE p.id = auth.uid())
  );

-- ============================================================
-- FIX 2: Remove direct INSERT policy on appointment_history
-- The trigger runs as SECURITY DEFINER and bypasses RLS,
-- so this policy only opens the table to forgery.
-- ============================================================

DROP POLICY IF EXISTS "Trigger can insert appointment history" ON public.appointment_history;

-- ============================================================
-- FIX 3: Tighten requester INSERT policy on appointments
-- Require customer_id matches their org and requester_id = self
-- ============================================================

DROP POLICY IF EXISTS "Requesters can insert appointments" ON public.appointments;

CREATE POLICY "Requesters can insert appointments"
  ON public.appointments FOR INSERT
  TO authenticated
  WITH CHECK (
    agency_id = get_user_agency_id(auth.uid())
    AND has_role(auth.uid(), 'requester'::app_role)
    AND requester_id = auth.uid()
    AND (
      customer_id IS NULL
      OR customer_id = get_user_customer_id(auth.uid())
    )
  );
