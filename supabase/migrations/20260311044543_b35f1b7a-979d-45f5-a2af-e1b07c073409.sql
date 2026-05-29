
CREATE OR REPLACE FUNCTION public.cancel_stale_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Cancel reminders for cancelled/no_show appointments
  UPDATE public.notification_log nl
  SET status = 'cancelled'
  WHERE nl.reminder_type IS NOT NULL
    AND nl.status IN ('pending', 'sent', 'failed')
    AND EXISTS (
      SELECT 1 FROM public.appointments a
      WHERE a.id = nl.appointment_id
        AND a.status IN ('cancelled', 'no_show')
    );

  -- Cancel reminders where interpreter was reassigned (recipient no longer matches current interpreter)
  UPDATE public.notification_log nl
  SET status = 'cancelled'
  WHERE nl.reminder_type IS NOT NULL
    AND nl.status IN ('pending', 'sent', 'failed')
    AND EXISTS (
      SELECT 1 FROM public.appointments a
      JOIN public.profiles p ON p.id = a.interpreter_id
      WHERE a.id = nl.appointment_id
        AND a.interpreter_id IS NOT NULL
        AND (
          (nl.channel = 'email' AND COALESCE(p.email, '') != nl.recipient)
          OR (nl.channel = 'sms' AND COALESCE(p.phone, '') != nl.recipient)
        )
    );
END;
$$;
