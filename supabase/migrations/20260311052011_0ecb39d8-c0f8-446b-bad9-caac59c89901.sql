
-- Index for reminder window queries: status + scheduled_start + interpreter_id
CREATE INDEX IF NOT EXISTS idx_appointments_reminder_window
  ON public.appointments (scheduled_start, status)
  WHERE interpreter_id IS NOT NULL
    AND status IN ('scheduled', 'confirmed', 'offered');

-- Index for deduplication lookups on notification_log
CREATE INDEX IF NOT EXISTS idx_notification_log_dedup
  ON public.notification_log (appointment_id, reminder_type, channel, status)
  WHERE reminder_type IS NOT NULL;

-- Index for interpreter notification prefs lookup
CREATE INDEX IF NOT EXISTS idx_interp_notif_prefs_lookup
  ON public.interpreter_notification_prefs (user_id, agency_id);
