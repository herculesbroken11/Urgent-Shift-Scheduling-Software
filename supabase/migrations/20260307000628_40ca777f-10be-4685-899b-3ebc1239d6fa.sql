
-- Table to link requestors to customers with access level
CREATE TABLE public.customer_requestors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  access_all_locations boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(customer_id, user_id)
);

-- Table to link requestors to specific locations
CREATE TABLE public.requestor_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_requestor_id uuid NOT NULL REFERENCES public.customer_requestors(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  UNIQUE(customer_requestor_id, location_id)
);

-- Enable RLS
ALTER TABLE public.customer_requestors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requestor_locations ENABLE ROW LEVEL SECURITY;

-- RLS for customer_requestors
CREATE POLICY "Admins and schedulers can manage customer requestors"
  ON public.customer_requestors FOR ALL
  USING (
    agency_id = get_user_agency_id(auth.uid())
    AND (has_role(auth.uid(), 'agency_admin') OR has_role(auth.uid(), 'scheduler'))
  );

CREATE POLICY "Requestors can view own records"
  ON public.customer_requestors FOR SELECT
  USING (user_id = auth.uid());

-- RLS for requestor_locations
CREATE POLICY "Admins and schedulers can manage requestor locations"
  ON public.requestor_locations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.customer_requestors cr
      WHERE cr.id = requestor_locations.customer_requestor_id
      AND cr.agency_id = get_user_agency_id(auth.uid())
      AND (has_role(auth.uid(), 'agency_admin') OR has_role(auth.uid(), 'scheduler'))
    )
  );

CREATE POLICY "Requestors can view own location assignments"
  ON public.requestor_locations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.customer_requestors cr
      WHERE cr.id = requestor_locations.customer_requestor_id
      AND cr.user_id = auth.uid()
    )
  );

-- Updated_at trigger for customer_requestors
CREATE TRIGGER update_customer_requestors_updated_at
  BEFORE UPDATE ON public.customer_requestors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
