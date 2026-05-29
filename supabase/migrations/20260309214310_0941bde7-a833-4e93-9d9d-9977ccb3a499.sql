
-- Per-user Google Calendar OAuth connections
CREATE TABLE public.google_calendar_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  google_email text,
  access_token text,
  refresh_token text NOT NULL,
  token_expires_at timestamptz,
  calendar_id text NOT NULL DEFAULT 'primary',
  timezone text NOT NULL DEFAULT 'America/New_York',
  sync_enabled boolean NOT NULL DEFAULT true,
  last_synced_at timestamptz,
  last_sync_error text,
  last_sync_status text NOT NULL DEFAULT 'never',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.google_calendar_connections ENABLE ROW LEVEL SECURITY;

-- Users can manage their own connection
CREATE POLICY "Users manage own calendar connection"
  ON public.google_calendar_connections FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Admins can view all connections in their agency
CREATE POLICY "Admins view agency calendar connections"
  ON public.google_calendar_connections FOR SELECT
  TO authenticated
  USING (
    agency_id = get_user_agency_id(auth.uid())
    AND has_role(auth.uid(), 'agency_admin'::app_role)
  );

-- Add timezone to agencies
ALTER TABLE public.agencies
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/New_York';

-- Add timezone to profiles (user-level override)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS timezone text;

-- Add sync tracking columns to appointments
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS gcal_event_id text,
  ADD COLUMN IF NOT EXISTS gcal_sync_status text DEFAULT 'unsynced',
  ADD COLUMN IF NOT EXISTS gcal_last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS gcal_sync_error text;
