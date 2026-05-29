
-- 1. Add customer_id FK to profiles
ALTER TABLE public.profiles
  ADD COLUMN customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL;

-- 2. Create a security-definer function to get the user's customer_id
CREATE OR REPLACE FUNCTION public.get_user_customer_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT customer_id FROM public.profiles WHERE id = _user_id LIMIT 1
$$;

-- 3. RLS policy: Requestors can SELECT appointments matching their org's customer_id
CREATE POLICY "Requestors can view org appointments"
  ON public.appointments
  FOR SELECT
  TO authenticated
  USING (
    customer_id IS NOT NULL
    AND customer_id = get_user_customer_id(auth.uid())
    AND has_role(auth.uid(), 'requester'::app_role)
  );
