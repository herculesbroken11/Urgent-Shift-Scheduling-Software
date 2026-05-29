
-- Invitations table for inviting interpreters (and other roles) by email
CREATE TABLE public.invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  email text NOT NULL,
  role app_role NOT NULL DEFAULT 'interpreter',
  first_name text,
  last_name text,
  phone text,
  token uuid NOT NULL DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'pending',
  invited_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  UNIQUE (agency_id, email, status)
);

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- Admins can manage invitations in their agency
CREATE POLICY "Admins can manage invitations"
ON public.invitations
FOR ALL
USING (
  agency_id = get_user_agency_id(auth.uid())
  AND has_role(auth.uid(), 'agency_admin'::app_role)
);

-- Schedulers can view invitations
CREATE POLICY "Schedulers can view invitations"
ON public.invitations
FOR SELECT
USING (
  agency_id = get_user_agency_id(auth.uid())
  AND has_role(auth.uid(), 'scheduler'::app_role)
);
