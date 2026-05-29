
-- =============================================
-- MIGRATION 1: Add columns, decouple functions from enum
-- =============================================

-- 1. Add new columns to appointments
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS requester_notes text,
  ADD COLUMN IF NOT EXISTS interpreter_notes text,
  ADD COLUMN IF NOT EXISTS agency_notes text,
  ADD COLUMN IF NOT EXISTS interpreter_notes_history jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS late_cancel_detected_at timestamptz;

-- 2. Add admin_confirms to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS admin_confirms boolean NOT NULL DEFAULT false;

-- 3. Drop triggers that depend on functions we're about to replace
DROP TRIGGER IF EXISTS trg_appointment_audit ON public.appointments;
DROP TRIGGER IF EXISTS trg_platform_usage ON public.appointments;

-- 4. Drop the appointments_live view (references status column typed as enum)
DROP VIEW IF EXISTS public.appointments_live;

-- 5. Drop the interpreter self-claim RLS policy (references ::appointment_status cast)
DROP POLICY IF EXISTS "Interpreters can update assigned appointments" ON public.appointments;

-- 6. Replace rollback_import_batch — cast status to text instead of ::appointment_status
CREATE OR REPLACE FUNCTION public.rollback_import_batch(_batch_id uuid, _user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _batch record;
  _dep_check jsonb;
  _created_count int := 0;
  _restored_count int := 0;
  _row record;
BEGIN
  SELECT * INTO _batch FROM import_batches WHERE id = _batch_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Batch not found';
  END IF;

  IF _batch.status != 'completed' THEN
    RAISE EXCEPTION 'Only completed batches can be rolled back (current: %)', _batch.status;
  END IF;

  IF _batch.is_rollbackable = false THEN
    RAISE EXCEPTION 'This batch is not rollbackable';
  END IF;

  _dep_check := check_rollback_dependencies(_batch_id);
  IF NOT (_dep_check->>'can_rollback')::boolean THEN
    RETURN _dep_check;
  END IF;

  PERFORM transition_import_batch(_batch_id, 'rolling_back', _user_id);

  FOR _row IN
    SELECT * FROM import_batch_rows
    WHERE batch_id = _batch_id AND action_taken = 'created' AND target_record_id IS NOT NULL
  LOOP
    CASE _batch.entity_type
      WHEN 'appointments' THEN
        UPDATE appointments SET is_deleted = true, deleted_at = now(), deleted_by = _user_id WHERE id = _row.target_record_id;
      WHEN 'customers' THEN
        UPDATE customers SET is_deleted = true, deleted_at = now(), deleted_by = _user_id WHERE id = _row.target_record_id;
      WHEN 'locations' THEN
        UPDATE locations SET is_deleted = true, deleted_at = now(), deleted_by = _user_id WHERE id = _row.target_record_id;
      WHEN 'interpreters' THEN
        UPDATE profiles SET is_deleted = true, deleted_at = now(), deleted_by = _user_id WHERE id = _row.target_record_id;
      ELSE NULL;
    END CASE;
    _created_count := _created_count + 1;
  END LOOP;

  FOR _row IN
    SELECT * FROM import_batch_rows
    WHERE batch_id = _batch_id AND action_taken = 'updated' AND target_record_id IS NOT NULL AND previous_data IS NOT NULL
  LOOP
    CASE _batch.entity_type
      WHEN 'appointments' THEN
        UPDATE appointments SET
          title = COALESCE((_row.previous_data->>'title'), title),
          status = (_row.previous_data->>'status')::text,
          scheduled_start = COALESCE((_row.previous_data->>'scheduled_start')::timestamptz, scheduled_start),
          scheduled_end = COALESCE((_row.previous_data->>'scheduled_end')::timestamptz, scheduled_end),
          customer_id = COALESCE((_row.previous_data->>'customer_id')::uuid, customer_id),
          location_id = COALESCE((_row.previous_data->>'location_id')::uuid, location_id),
          interpreter_id = (_row.previous_data->>'interpreter_id')::uuid,
          language_id = COALESCE((_row.previous_data->>'language_id')::uuid, language_id),
          notes = _row.previous_data->>'notes',
          category = _row.previous_data->>'category',
          patient_client_name = _row.previous_data->>'patient_client_name',
          updated_at = now()
        WHERE id = _row.target_record_id;
      WHEN 'customers' THEN
        UPDATE customers SET
          name = COALESCE((_row.previous_data->>'name'), name),
          contact_name = _row.previous_data->>'contact_name',
          contact_email = _row.previous_data->>'contact_email',
          contact_phone = _row.previous_data->>'contact_phone',
          billing_email = _row.previous_data->>'billing_email',
          updated_at = now()
        WHERE id = _row.target_record_id;
      WHEN 'locations' THEN
        UPDATE locations SET
          name = COALESCE((_row.previous_data->>'name'), name),
          address_line1 = _row.previous_data->>'address_line1',
          city = _row.previous_data->>'city',
          state = _row.previous_data->>'state',
          zip_code = _row.previous_data->>'zip_code',
          raw_address = _row.previous_data->>'raw_address'
        WHERE id = _row.target_record_id;
      WHEN 'interpreters' THEN
        UPDATE profiles SET
          first_name = _row.previous_data->>'first_name',
          last_name = _row.previous_data->>'last_name',
          email = _row.previous_data->>'email',
          phone = _row.previous_data->>'phone',
          updated_at = now()
        WHERE id = _row.target_record_id;
      ELSE NULL;
    END CASE;
    _restored_count := _restored_count + 1;
  END LOOP;

  PERFORM transition_import_batch(_batch_id, 'rolled_back', _user_id);

  RETURN jsonb_build_object(
    'success', true,
    'created_reverted', _created_count,
    'updated_restored', _restored_count
  );
END;
$$;

-- 7. Replace cancel_stale_reminders — use text casts
CREATE OR REPLACE FUNCTION public.cancel_stale_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.notification_log nl
  SET status = 'cancelled'
  WHERE nl.reminder_type IS NOT NULL
    AND nl.status IN ('pending', 'sent', 'failed')
    AND EXISTS (
      SELECT 1 FROM public.appointments a
      WHERE a.id = nl.appointment_id
        AND (a.status::text IN ('cancelled', 'no_show', 'late_cancel_no_show_client', 'no_show_interpreter') OR a.is_deleted = true OR a.is_import_staged = true)
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
$$;

-- 8. Replace record_platform_usage — use text casts, update trigger statuses
CREATE OR REPLACE FUNCTION public.record_platform_usage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    _trigger_statuses := ARRAY['scheduled', 'confirmed', 'offered', 'interpreter_assigned', 'interpreter_assigned_last_minute', 'interpreter_confirmed'];
  ELSE
    _trigger_statuses := ARRAY['completed', 'validated', 'billed', 'completed_last_minute'];
  END IF;

  IF NOT (NEW.status::text = ANY(_trigger_statuses)) THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM platform_usage_log WHERE appointment_id = NEW.id) THEN RETURN NEW; END IF;

  _fee := _config.per_appointment_fee;
  _month := to_char(COALESCE(NEW.scheduled_start, now()), 'YYYY-MM');

  INSERT INTO platform_usage_log (agency_id, appointment_id, trigger_type, triggered_status, fee_amount, billing_month)
  VALUES (NEW.agency_id, NEW.id, _config.usage_billing_trigger, NEW.status::text, _fee, _month);

  RETURN NEW;
END;
$$;

-- 9. Replace log_appointment_change — no enum dependency (already generic, but ensure no casts)
CREATE OR REPLACE FUNCTION public.log_appointment_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _changed text[] := '{}';
  _action text;
  _old jsonb;
  _new jsonb;
  _agency uuid;
  _appt_id uuid;
  _user uuid;
BEGIN
  _user := auth.uid();

  IF TG_OP = 'INSERT' AND NEW.is_import_staged = true THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.import_batch_id IS NOT NULL AND NEW.is_import_staged = true THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    _action := 'DELETE';
    _old := to_jsonb(OLD);
    _new := NULL;
    _agency := OLD.agency_id;
    _appt_id := OLD.id;
  ELSIF TG_OP = 'INSERT' THEN
    _action := 'INSERT';
    _old := NULL;
    _new := to_jsonb(NEW);
    _agency := NEW.agency_id;
    _appt_id := NEW.id;
  ELSE
    _action := 'UPDATE';
    _old := to_jsonb(OLD);
    _new := to_jsonb(NEW);
    _agency := NEW.agency_id;
    _appt_id := NEW.id;

    SELECT array_agg(key) INTO _changed
    FROM jsonb_each(_new) n
    WHERE n.value IS DISTINCT FROM (_old -> n.key);
  END IF;

  INSERT INTO public.appointment_history (appointment_id, agency_id, changed_by, action, old_data, new_data, changed_fields)
  VALUES (_appt_id, _agency, _user, _action, _old, _new, _changed);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- 10. Replace get_dashboard_counts — use text casts
CREATE OR REPLACE FUNCTION public.get_dashboard_counts(
  _agency_id uuid,
  _statuses text[],
  _interpreter_id uuid DEFAULT NULL,
  _customer_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_object_agg(status_text, cnt), '{}'::jsonb)
  FROM (
    SELECT status::text as status_text, count(*)::int as cnt
    FROM appointments
    WHERE agency_id = _agency_id
      AND is_import_staged = false
      AND is_deleted = false
      AND status::text = ANY(_statuses)
      AND (_interpreter_id IS NULL OR interpreter_id = _interpreter_id)
      AND (_customer_id IS NULL OR customer_id = _customer_id)
    GROUP BY status::text
  ) t;
$$;
