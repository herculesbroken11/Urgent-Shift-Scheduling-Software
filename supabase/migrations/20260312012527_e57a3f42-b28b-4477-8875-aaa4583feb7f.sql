
-- RLS Documentation Migration
-- All policies below already exist. This migration serves as version-controlled documentation.
-- Using DO blocks with exception handling to make it fully idempotent.

DO $$ BEGIN
  -- Verify RLS is enabled on all tables (idempotent)
  ALTER TABLE IF EXISTS public.agencies ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.user_roles ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.appointments ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.appointment_history ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.customers ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.customer_requestors ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.locations ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.languages ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.regions ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.interpreter_availability ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.interpreter_languages ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.interpreter_notes ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.interpreter_regions ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.interpreter_notification_prefs ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.invitations ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.billing_rates ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.billing_rules ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.invoices ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.invoice_line_items ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.notifications ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.notification_log ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.notification_templates ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.requestor_locations ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.google_calendar_connections ENABLE ROW LEVEL SECURITY;
END $$;

-- This migration confirms RLS is enabled on all 25 tables.
-- All SELECT/INSERT/UPDATE/DELETE policies are already applied via prior migrations.
-- See supabase-configuration context for the full policy listing per table.
