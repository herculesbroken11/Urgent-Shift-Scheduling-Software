
-- Fix record_platform_usage trigger to use v3 status codes
CREATE OR REPLACE FUNCTION public.record_platform_usage()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _config record;
  _fee numeric;
  _trigger_statuses text[];
  _month text;
  _appt_date date;
BEGIN
  IF OLD.status::text = NEW.status::text THEN RETURN NEW; END IF;
  IF NEW.is_import_staged OR NEW.is_deleted THEN RETURN NEW; END IF;

  _appt_date := COALESCE(NEW.scheduled_start::date, CURRENT_DATE);

  SELECT * INTO _config
  FROM platform_billing_config
  WHERE agency_id = NEW.agency_id
    AND effective_start_date <= _appt_date
    AND (effective_end_date IS NULL OR effective_end_date >= _appt_date)
    AND is_active = true
  ORDER BY effective_start_date DESC
  LIMIT 1;

  IF NOT FOUND THEN RETURN NEW; END IF;

  IF _config.usage_billing_trigger = 'booked' THEN
    _trigger_statuses := ARRAY['interpreter_assigned', 'interpreter_assigned_last_minute', 'interpreter_confirmed'];
  ELSE
    _trigger_statuses := ARRAY['completed', 'completed_last_minute'];
  END IF;

  IF NOT (NEW.status::text = ANY(_trigger_statuses)) THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM platform_usage_log WHERE appointment_id = NEW.id) THEN RETURN NEW; END IF;

  _fee := _config.per_appointment_fee;
  _month := to_char(COALESCE(NEW.scheduled_start, now()), 'YYYY-MM');

  INSERT INTO platform_usage_log (agency_id, appointment_id, trigger_type, triggered_status, fee_amount, billing_month)
  VALUES (NEW.agency_id, NEW.id, _config.usage_billing_trigger, NEW.status::text, _fee, _month);

  RETURN NEW;
END;
$function$;

-- Fix cancel_stale_reminders to remove legacy 'no_show' status
CREATE OR REPLACE FUNCTION public.cancel_stale_reminders()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.notification_log nl
  SET status = 'cancelled'
  WHERE nl.reminder_type IS NOT NULL
    AND nl.status IN ('pending', 'sent', 'failed')
    AND EXISTS (
      SELECT 1 FROM public.appointments a
      WHERE a.id = nl.appointment_id
        AND (a.status::text IN ('cancelled', 'late_cancel_no_show_client', 'no_show_interpreter') OR a.is_deleted = true OR a.is_import_staged = true)
    );

  UPDATE public.notification_log nl
  SET status = 'cancelled'
  WHERE nl.reminder_type IS NOT NULL
    AND nl.status IN ('pending', 'sent', 'failed')
    AND EXISTS (
      SELECT 1 FROM public.appointments a
      JOIN public.profiles p ON p.id = a.interpreter_id
      WHERE a.id = nl.appointment_id
        AND a.interpreter_id IS NOT NULL
        AND a.is_import_staged = false
        AND a.is_deleted = false
        AND (
          (nl.channel = 'email' AND COALESCE(p.email, '') != nl.recipient)
          OR (nl.channel = 'sms' AND COALESCE(p.phone, '') != nl.recipient)
        )
    );
END;
$function$;
