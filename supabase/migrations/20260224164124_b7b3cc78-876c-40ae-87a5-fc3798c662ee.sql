
-- =============================================
-- Phase 1: Multi-tenant Database Architecture
-- =============================================

-- Role enum for the platform
CREATE TYPE public.app_role AS ENUM ('agency_admin', 'scheduler', 'requester', 'interpreter');

-- Appointment status enum
CREATE TYPE public.appointment_status AS ENUM (
  'pending', 'scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show'
);

-- Assignment method enum
CREATE TYPE public.assignment_method AS ENUM (
  'self_claim', 'availability', 'offer', 'manual'
);

-- =============================================
-- Agencies (tenants)
-- =============================================
CREATE TABLE public.agencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  address TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  logo_url TEXT,
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.agencies ENABLE ROW LEVEL SECURITY;

-- =============================================
-- Profiles (linked to auth.users)
-- =============================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  agency_id UUID REFERENCES public.agencies(id) ON DELETE SET NULL,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  avatar_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- =============================================
-- User roles (separate table per security requirements)
-- =============================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  agency_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  UNIQUE (user_id, role, agency_id)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- =============================================
-- Languages
-- =============================================
CREATE TABLE public.languages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE
);

ALTER TABLE public.languages ENABLE ROW LEVEL SECURITY;

-- Insert common languages
INSERT INTO public.languages (name, code) VALUES
  ('Spanish', 'es'), ('Mandarin', 'zh'), ('French', 'fr'), ('Arabic', 'ar'),
  ('Vietnamese', 'vi'), ('Korean', 'ko'), ('Russian', 'ru'), ('Portuguese', 'pt'),
  ('Japanese', 'ja'), ('Tagalog', 'tl'), ('Hindi', 'hi'), ('German', 'de'),
  ('Italian', 'it'), ('Haitian Creole', 'ht'), ('Somali', 'so'), ('Cantonese', 'yue'),
  ('Punjabi', 'pa'), ('Burmese', 'my'), ('Nepali', 'ne'), ('ASL', 'asl');

-- =============================================
-- Interpreter languages (junction)
-- =============================================
CREATE TABLE public.interpreter_languages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interpreter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  language_id UUID NOT NULL REFERENCES public.languages(id) ON DELETE CASCADE,
  is_certified BOOLEAN DEFAULT false,
  certification_details TEXT,
  UNIQUE (interpreter_id, language_id)
);

ALTER TABLE public.interpreter_languages ENABLE ROW LEVEL SECURITY;

-- =============================================
-- Customers (requesting organizations)
-- =============================================
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  billing_email TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- =============================================
-- Locations
-- =============================================
CREATE TABLE public.locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  agency_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  phone TEXT,
  navigation_instructions TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

-- =============================================
-- Appointments
-- =============================================
CREATE TABLE public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id),
  location_id UUID REFERENCES public.locations(id),
  requester_id UUID REFERENCES public.profiles(id),
  interpreter_id UUID REFERENCES public.profiles(id),
  language_id UUID REFERENCES public.languages(id),
  status public.appointment_status NOT NULL DEFAULT 'pending',
  assignment_method public.assignment_method,
  title TEXT,
  description TEXT,
  scheduled_start TIMESTAMPTZ,
  scheduled_end TIMESTAMPTZ,
  actual_start TIMESTAMPTZ,
  actual_end TIMESTAMPTZ,
  is_self_claimable BOOLEAN DEFAULT false,
  cancellation_reason TEXT,
  cancelled_at TIMESTAMPTZ,
  custom_fields JSONB DEFAULT '{}'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

-- =============================================
-- Security definer function for role checks
-- =============================================
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Get user's agency_id
CREATE OR REPLACE FUNCTION public.get_user_agency_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT agency_id FROM public.profiles WHERE id = _user_id LIMIT 1
$$;

-- =============================================
-- RLS Policies
-- =============================================

-- Agencies: members can view their own agency
CREATE POLICY "Users can view their own agency"
  ON public.agencies FOR SELECT TO authenticated
  USING (id = public.get_user_agency_id(auth.uid()));

-- Profiles: users can view profiles in their agency
CREATE POLICY "Users can view profiles in their agency"
  ON public.profiles FOR SELECT TO authenticated
  USING (agency_id = public.get_user_agency_id(auth.uid()));

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

-- User roles: users can view roles in their agency
CREATE POLICY "Users can view roles in their agency"
  ON public.user_roles FOR SELECT TO authenticated
  USING (agency_id = public.get_user_agency_id(auth.uid()));

CREATE POLICY "Admins can manage roles"
  ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'agency_admin') AND agency_id = public.get_user_agency_id(auth.uid()));

-- Languages: public read
CREATE POLICY "Anyone can view languages"
  ON public.languages FOR SELECT TO authenticated
  USING (true);

-- Interpreter languages: agency members can view
CREATE POLICY "Agency members can view interpreter languages"
  ON public.interpreter_languages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = interpreter_id AND p.agency_id = public.get_user_agency_id(auth.uid())
    )
  );

CREATE POLICY "Interpreters can manage own languages"
  ON public.interpreter_languages FOR ALL TO authenticated
  USING (interpreter_id = auth.uid());

-- Customers: agency-scoped
CREATE POLICY "Agency members can view customers"
  ON public.customers FOR SELECT TO authenticated
  USING (agency_id = public.get_user_agency_id(auth.uid()));

CREATE POLICY "Admins and schedulers can manage customers"
  ON public.customers FOR ALL TO authenticated
  USING (
    agency_id = public.get_user_agency_id(auth.uid())
    AND (public.has_role(auth.uid(), 'agency_admin') OR public.has_role(auth.uid(), 'scheduler'))
  );

-- Locations: agency-scoped
CREATE POLICY "Agency members can view locations"
  ON public.locations FOR SELECT TO authenticated
  USING (agency_id = public.get_user_agency_id(auth.uid()));

CREATE POLICY "Admins and schedulers can manage locations"
  ON public.locations FOR ALL TO authenticated
  USING (
    agency_id = public.get_user_agency_id(auth.uid())
    AND (public.has_role(auth.uid(), 'agency_admin') OR public.has_role(auth.uid(), 'scheduler'))
  );

-- Appointments: agency-scoped with role-based access
CREATE POLICY "Agency members can view appointments"
  ON public.appointments FOR SELECT TO authenticated
  USING (agency_id = public.get_user_agency_id(auth.uid()));

CREATE POLICY "Admins and schedulers can manage appointments"
  ON public.appointments FOR ALL TO authenticated
  USING (
    agency_id = public.get_user_agency_id(auth.uid())
    AND (public.has_role(auth.uid(), 'agency_admin') OR public.has_role(auth.uid(), 'scheduler'))
  );

CREATE POLICY "Requesters can insert appointments"
  ON public.appointments FOR INSERT TO authenticated
  WITH CHECK (
    agency_id = public.get_user_agency_id(auth.uid())
    AND public.has_role(auth.uid(), 'requester')
  );

CREATE POLICY "Interpreters can update assigned appointments"
  ON public.appointments FOR UPDATE TO authenticated
  USING (
    interpreter_id = auth.uid()
    AND agency_id = public.get_user_agency_id(auth.uid())
  );

-- =============================================
-- Triggers for updated_at
-- =============================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_agencies_updated_at BEFORE UPDATE ON public.agencies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_appointments_updated_at BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- Auto-create profile on signup
-- =============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
