-- Atomic onboarding bootstrap to avoid multi-step RLS race/failures
CREATE OR REPLACE FUNCTION public.bootstrap_agency_admin(
  _agency_name text,
  _agency_slug text,
  _first_name text,
  _last_name text
)
RETURNS public.agencies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _agency public.agencies;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF public.get_user_agency_id(_user_id) IS NOT NULL THEN
    RAISE EXCEPTION 'User already belongs to an agency';
  END IF;

  INSERT INTO public.agencies (name, slug)
  VALUES (_agency_name, _agency_slug)
  RETURNING * INTO _agency;

  UPDATE public.profiles
  SET
    agency_id = _agency.id,
    first_name = _first_name,
    last_name = _last_name,
    is_active = true
  WHERE id = _user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for current user';
  END IF;

  INSERT INTO public.user_roles (user_id, role, agency_id)
  VALUES (_user_id, 'agency_admin'::app_role, _agency.id);

  RETURN _agency;
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_agency_admin(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bootstrap_agency_admin(text, text, text, text) TO authenticated;