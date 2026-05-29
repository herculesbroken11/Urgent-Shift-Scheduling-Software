
-- Phase 2: Add customer_id to invitations for requester role linkage
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL;

-- Phase 4: Join requests table
CREATE TABLE IF NOT EXISTS public.join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  email text NOT NULL,
  first_name text,
  last_name text,
  phone text,
  requested_role text NOT NULL DEFAULT 'interpreter',
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  rejection_reason text,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.join_requests ENABLE ROW LEVEL SECURITY;

-- RLS: agency admins can see join requests for their agency
CREATE POLICY "Agency admins can view join requests"
  ON public.join_requests FOR SELECT TO authenticated
  USING (agency_id = (SELECT agency_id FROM public.profiles WHERE id = auth.uid() LIMIT 1)
    AND public.has_role(auth.uid(), 'agency_admin'));

CREATE POLICY "Agency admins can update join requests"
  ON public.join_requests FOR UPDATE TO authenticated
  USING (agency_id = (SELECT agency_id FROM public.profiles WHERE id = auth.uid() LIMIT 1)
    AND public.has_role(auth.uid(), 'agency_admin'));

-- Anyone can insert (public join requests)
CREATE POLICY "Anyone can create join requests"
  ON public.join_requests FOR INSERT TO authenticated
  WITH CHECK (true);

-- Trigger for updated_at
CREATE TRIGGER update_join_requests_updated_at
  BEFORE UPDATE ON public.join_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
