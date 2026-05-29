
-- ============================================================
-- Agency-scope the has_role function
-- Previously it checked (user_id, role) globally across all agencies.
-- Now it restricts the lookup to the user's current agency,
-- preventing cross-agency privilege escalation.
-- ============================================================

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
      AND agency_id = (SELECT agency_id FROM public.profiles WHERE id = _user_id LIMIT 1)
  )
$$;
