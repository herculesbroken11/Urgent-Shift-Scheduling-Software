
-- 1. Create service_modality enum
CREATE TYPE public.service_modality AS ENUM ('on_site', 'opi', 'vri');

-- 2. Add modality column to appointments
ALTER TABLE public.appointments ADD COLUMN modality public.service_modality DEFAULT 'on_site';

-- 3. Create regions table
CREATE TABLE public.regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency members can view regions"
  ON public.regions FOR SELECT
  USING (agency_id = get_user_agency_id(auth.uid()));

CREATE POLICY "Admins can manage regions"
  ON public.regions FOR ALL
  USING (agency_id = get_user_agency_id(auth.uid()) AND has_role(auth.uid(), 'agency_admin'::app_role));

-- 4. Create interpreter_regions junction table
CREATE TABLE public.interpreter_regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interpreter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  region_id uuid NOT NULL REFERENCES public.regions(id) ON DELETE CASCADE,
  UNIQUE(interpreter_id, region_id)
);

ALTER TABLE public.interpreter_regions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency members can view interpreter regions"
  ON public.interpreter_regions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = interpreter_regions.interpreter_id
    AND p.agency_id = get_user_agency_id(auth.uid())
  ));

CREATE POLICY "Admins can manage interpreter regions"
  ON public.interpreter_regions FOR ALL
  USING (EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = interpreter_regions.interpreter_id
    AND p.agency_id = get_user_agency_id(auth.uid())
    AND has_role(auth.uid(), 'agency_admin'::app_role)
  ));

CREATE POLICY "Interpreters can manage own regions"
  ON public.interpreter_regions FOR ALL
  USING (interpreter_id = auth.uid());

-- 5. Add region_id to locations
ALTER TABLE public.locations ADD COLUMN region_id uuid REFERENCES public.regions(id);
