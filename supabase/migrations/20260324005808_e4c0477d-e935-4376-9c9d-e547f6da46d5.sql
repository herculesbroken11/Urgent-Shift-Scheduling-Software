
-- Fix security definer views — set to SECURITY INVOKER so RLS of querying user applies
ALTER VIEW public.customers_live SET (security_invoker = on);
ALTER VIEW public.locations_live SET (security_invoker = on);
ALTER VIEW public.profiles_live SET (security_invoker = on);
ALTER VIEW public.appointments_live SET (security_invoker = on);
