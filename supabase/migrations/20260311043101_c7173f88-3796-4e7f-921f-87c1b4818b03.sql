
-- Function to cancel pending reminders for cancelled/reassigned appointments
CREATE OR REPLACE FUNCTION public.cancel_stale_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Cancel reminders for cancelled appointments
  UPDATE public.notification_log nl
  SET status = 'cancelled'
  WHERE nl.reminder_type IS NOT NULL
    AND nl.status = 'pending'
    AND EXISTS (
      SELECT 1 FROM public.appointments a
      WHERE a.id = nl.appointment_id
        AND a.status IN ('cancelled', 'no_show')
    );

  -- Cancel reminders where interpreter was reassigned
  UPDATE public.notification_log nl
  SET status = 'cancelled'
  WHERE nl.reminder_type IS NOT NULL
    AND nl.status = 'sent'
    AND nl.channel IN ('email', 'sms')
    AND EXISTS (
      SELECT 1 FROM public.appointments a
      JOIN public.profiles p ON p.id = a.interpreter_id
      WHERE a.id = nl.appointment_id
        AND (
          (nl.channel = 'email' AND p.email != nl.recipient)
          OR (nl.channel = 'sms' AND p.phone != nl.recipient)
        )
    );
END;
$$;
