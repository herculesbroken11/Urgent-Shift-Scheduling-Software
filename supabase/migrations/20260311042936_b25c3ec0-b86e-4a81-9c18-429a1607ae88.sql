
-- Add reminder_type column to notification_log for deduplication
ALTER TABLE public.notification_log
  ADD COLUMN IF NOT EXISTS reminder_type text,
  ADD COLUMN IF NOT EXISTS appointment_id uuid REFERENCES public.appointments(id) ON DELETE CASCADE;

-- Create index for fast reminder deduplication lookups
CREATE INDEX IF NOT EXISTS idx_notification_log_reminder_dedup
  ON public.notification_log (appointment_id, reminder_type, channel)
  WHERE reminder_type IS NOT NULL;

-- Create index for pending reminder cancellation
CREATE INDEX IF NOT EXISTS idx_notification_log_pending_reminders
  ON public.notification_log (appointment_id, status)
  WHERE reminder_type IS NOT NULL AND status = 'pending';
