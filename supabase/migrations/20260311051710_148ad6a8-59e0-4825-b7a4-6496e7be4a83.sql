
-- Create dedicated interpreter notification preferences table
CREATE TABLE public.interpreter_notification_prefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  enable_email_notifications boolean NOT NULL DEFAULT true,
  enable_sms_notifications boolean NOT NULL DEFAULT true,
  reminder_24h_enabled boolean NOT NULL DEFAULT true,
  reminder_2h_enabled boolean NOT NULL DEFAULT true,
  reminder_15m_enabled boolean NOT NULL DEFAULT true,
  preferred_notification_channel text NOT NULL DEFAULT 'both',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, agency_id)
);

-- Enable RLS
ALTER TABLE public.interpreter_notification_prefs ENABLE ROW LEVEL SECURITY;

-- Interpreters can manage their own prefs
CREATE POLICY "Interpreters manage own notification prefs"
  ON public.interpreter_notification_prefs
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND agency_id = get_user_agency_id(auth.uid()));

-- Admins can view all prefs in their agency
CREATE POLICY "Admins view agency notification prefs"
  ON public.interpreter_notification_prefs
  FOR SELECT
  TO authenticated
  USING (agency_id = get_user_agency_id(auth.uid()) AND has_role(auth.uid(), 'agency_admin'::app_role));

-- Updated_at trigger
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.interpreter_notification_prefs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
