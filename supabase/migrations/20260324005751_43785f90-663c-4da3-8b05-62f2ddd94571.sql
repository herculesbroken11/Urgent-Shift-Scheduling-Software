
-- ============================================================
-- Migration: Live views + notification suppression + search_appointments update
-- ============================================================

-- 1. Create _live views that exclude staged and soft-deleted records
CREATE OR REPLACE VIEW public.customers_live AS
  SELECT * FROM public.customers
  WHERE is_import_staged = false AND is_deleted = false;

CREATE OR REPLACE VIEW public.locations_live AS
  SELECT * FROM public.locations
  WHERE is_import_staged = false AND is_deleted = false;

CREATE OR REPLACE VIEW public.profiles_live AS
  SELECT * FROM public.profiles
  WHERE is_import_staged = false AND is_deleted = false;

CREATE OR REPLACE VIEW public.appointments_live AS
  SELECT * FROM public.appointments
  WHERE is_import_staged = false AND is_deleted = false;

-- 2. Update the audit trigger to skip staged/import records
CREATE OR REPLACE FUNCTION public.log_appointment_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Skip audit logging for staged/imported records
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
$function$;

-- 3. Update search_appointments to exclude staged/deleted
CREATE OR REPLACE FUNCTION public.search_appointments(
  _status text DEFAULT NULL,
  _date_from timestamptz DEFAULT NULL,
  _date_to timestamptz DEFAULT NULL,
  _search text DEFAULT NULL,
  _assignment text DEFAULT 'all',
  _page_size int DEFAULT 50,
  _page int DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _agency_id uuid;
  _total int;
  _rows jsonb;
  _off int := _page * _page_size;
BEGIN
  _agency_id := get_user_agency_id(auth.uid());
  IF _agency_id IS NULL THEN
    RETURN jsonb_build_object('data', '[]'::jsonb, 'total_count', 0);
  END IF;

  SELECT count(*) INTO _total
  FROM appointments a
  LEFT JOIN customers c ON c.id = a.customer_id
  LEFT JOIN languages l ON l.id = a.language_id
  LEFT JOIN profiles p ON p.id = a.interpreter_id
  WHERE a.agency_id = _agency_id
    AND a.is_import_staged = false
    AND a.is_deleted = false
    AND (_status IS NULL OR a.status::text = _status)
    AND (_date_from IS NULL OR a.scheduled_start >= _date_from)
    AND (_date_to IS NULL OR a.scheduled_start <= _date_to)
    AND (_assignment = 'all'
      OR (_assignment = 'assigned' AND a.interpreter_id IS NOT NULL)
      OR (_assignment = 'unassigned' AND a.interpreter_id IS NULL))
    AND (_search IS NULL OR _search = ''
      OR a.title ILIKE '%' || _search || '%'
      OR c.name ILIKE '%' || _search || '%'
      OR l.name ILIKE '%' || _search || '%'
      OR (p.first_name || ' ' || p.last_name) ILIKE '%' || _search || '%');

  WITH page_data AS (
    SELECT
      a.id, a.title, a.status::text as status,
      a.scheduled_start, a.scheduled_end,
      a.description, a.notes, a.modality::text as modality,
      a.customer_id, a.location_id, a.language_id,
      a.interpreter_id, a.requester_id,
      a.parent_recurring_id, a.recurrence_rule, a.custom_fields,
      a.is_self_claimable, a.assignment_method::text as assignment_method,
      a.actual_start, a.actual_end, a.parking_cost,
      c.name as customer_name,
      loc.name as location_name, loc.address_line1 as loc_addr,
      loc.city as loc_city, loc.state as loc_state, loc.zip_code as loc_zip,
      l.name as lang_name, l.code as lang_code,
      p.first_name as interp_first, p.last_name as interp_last,
      req.first_name as req_first, req.last_name as req_last
    FROM appointments a
    LEFT JOIN customers c ON c.id = a.customer_id
    LEFT JOIN locations loc ON loc.id = a.location_id
    LEFT JOIN languages l ON l.id = a.language_id
    LEFT JOIN profiles p ON p.id = a.interpreter_id
    LEFT JOIN profiles req ON req.id = a.requester_id
    WHERE a.agency_id = _agency_id
      AND a.is_import_staged = false
      AND a.is_deleted = false
      AND (_status IS NULL OR a.status::text = _status)
      AND (_date_from IS NULL OR a.scheduled_start >= _date_from)
      AND (_date_to IS NULL OR a.scheduled_start <= _date_to)
      AND (_assignment = 'all'
        OR (_assignment = 'assigned' AND a.interpreter_id IS NOT NULL)
        OR (_assignment = 'unassigned' AND a.interpreter_id IS NULL))
      AND (_search IS NULL OR _search = ''
        OR a.title ILIKE '%' || _search || '%'
        OR c.name ILIKE '%' || _search || '%'
        OR l.name ILIKE '%' || _search || '%'
        OR (p.first_name || ' ' || p.last_name) ILIKE '%' || _search || '%')
    ORDER BY a.scheduled_start DESC NULLS LAST
    LIMIT _page_size OFFSET _off
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', pd.id, 'title', pd.title, 'status', pd.status,
      'scheduled_start', pd.scheduled_start, 'scheduled_end', pd.scheduled_end,
      'description', pd.description, 'notes', pd.notes, 'modality', pd.modality,
      'customer_id', pd.customer_id, 'location_id', pd.location_id,
      'language_id', pd.language_id, 'interpreter_id', pd.interpreter_id,
      'requester_id', pd.requester_id,
      'parent_recurring_id', pd.parent_recurring_id, 'recurrence_rule', pd.recurrence_rule,
      'custom_fields', pd.custom_fields,
      'is_self_claimable', pd.is_self_claimable, 'assignment_method', pd.assignment_method,
      'actual_start', pd.actual_start, 'actual_end', pd.actual_end, 'parking_cost', pd.parking_cost,
      'customers', CASE WHEN pd.customer_name IS NOT NULL THEN jsonb_build_object('name', pd.customer_name) ELSE NULL END,
      'locations', CASE WHEN pd.location_name IS NOT NULL THEN jsonb_build_object('name', pd.location_name, 'address_line1', pd.loc_addr, 'city', pd.loc_city, 'state', pd.loc_state, 'zip_code', pd.loc_zip) ELSE NULL END,
      'languages', CASE WHEN pd.lang_name IS NOT NULL THEN jsonb_build_object('name', pd.lang_name, 'code', pd.lang_code) ELSE NULL END,
      'interpreter', CASE WHEN pd.interp_first IS NOT NULL THEN jsonb_build_object('first_name', pd.interp_first, 'last_name', pd.interp_last) ELSE NULL END,
      'requester', CASE WHEN pd.req_first IS NOT NULL THEN jsonb_build_object('first_name', pd.req_first, 'last_name', pd.req_last) ELSE NULL END
    )
  ), '[]'::jsonb) INTO _rows FROM page_data pd;

  RETURN jsonb_build_object('data', _rows, 'total_count', _total);
END;
$function$;

-- 4. Update get_dashboard_counts to exclude staged/deleted
CREATE OR REPLACE FUNCTION public.get_dashboard_counts(
  _agency_id uuid,
  _statuses text[],
  _interpreter_id uuid DEFAULT NULL,
  _customer_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(jsonb_object_agg(status::text, cnt), '{}'::jsonb)
  FROM (
    SELECT status, count(*)::int as cnt
    FROM appointments
    WHERE agency_id = _agency_id
      AND is_import_staged = false
      AND is_deleted = false
      AND status::text = ANY(_statuses)
      AND (_interpreter_id IS NULL OR interpreter_id = _interpreter_id)
      AND (_customer_id IS NULL OR customer_id = _customer_id)
    GROUP BY status
  ) t;
$function$;

-- 5. Update get_report_data to exclude staged/deleted
CREATE OR REPLACE FUNCTION public.get_report_data()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _agency_id uuid;
  _since timestamptz;
  _week_start timestamptz;
BEGIN
  _agency_id := get_user_agency_id(auth.uid());
  IF _agency_id IS NULL THEN RETURN '{}'::jsonb; END IF;
  _since := date_trunc('month', now() - interval '5 months');
  _week_start := date_trunc('week', now());

  RETURN jsonb_build_object(
    'status_counts', COALESCE((
      SELECT jsonb_object_agg(status::text, cnt)
      FROM (SELECT status, count(*)::int cnt FROM appointments WHERE agency_id = _agency_id AND is_import_staged = false AND is_deleted = false AND scheduled_start >= _since GROUP BY status) x
    ), '{}'),
    'total_appointments', (SELECT count(*)::int FROM appointments WHERE agency_id = _agency_id AND is_import_staged = false AND is_deleted = false AND scheduled_start >= _since),
    'completed_count', (SELECT count(*)::int FROM appointments WHERE agency_id = _agency_id AND is_import_staged = false AND is_deleted = false AND scheduled_start >= _since AND status = 'completed'),
    'active_interpreters', (SELECT count(DISTINCT interpreter_id)::int FROM appointments WHERE agency_id = _agency_id AND is_import_staged = false AND is_deleted = false AND scheduled_start >= _since AND interpreter_id IS NOT NULL AND status = 'completed'),
    'monthly_trends', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('month', to_char(m, 'Mon YYYY'), 'count', COALESCE(c, 0)) ORDER BY m)
      FROM generate_series(_since, date_trunc('month', now()), '1 month') m
      LEFT JOIN (
        SELECT date_trunc('month', scheduled_start) mo, count(*)::int c
        FROM appointments WHERE agency_id = _agency_id AND is_import_staged = false AND is_deleted = false AND scheduled_start >= _since GROUP BY 1
      ) a ON a.mo = m
    ), '[]'),
    'language_distribution', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('name', name, 'value', cnt) ORDER BY cnt DESC)
      FROM (
        SELECT COALESCE(l.name, 'Unknown') name, count(*)::int cnt
        FROM appointments a LEFT JOIN languages l ON l.id = a.language_id
        WHERE a.agency_id = _agency_id AND a.is_import_staged = false AND a.is_deleted = false AND a.scheduled_start >= _since
        GROUP BY l.name ORDER BY cnt DESC LIMIT 7
      ) x
    ), '[]'),
    'interpreter_utilization', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('name', name, 'count', cnt) ORDER BY cnt DESC)
      FROM (
        SELECT p.first_name || ' ' || p.last_name name, count(*)::int cnt
        FROM appointments a JOIN profiles p ON p.id = a.interpreter_id
        WHERE a.agency_id = _agency_id AND a.is_import_staged = false AND a.is_deleted = false AND a.scheduled_start >= _since AND a.interpreter_id IS NOT NULL AND a.status = 'completed'
        GROUP BY p.first_name, p.last_name ORDER BY cnt DESC LIMIT 10
      ) x
    ), '[]'),
    'monthly_revenue', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('month', to_char(m, 'Mon YYYY'), 'total', COALESCE(t, 0)) ORDER BY m)
      FROM generate_series(_since, date_trunc('month', now()), '1 month') m
      LEFT JOIN (
        SELECT date_trunc('month', i.created_at) mo, sum(li.amount)::numeric t
        FROM invoices i JOIN invoice_line_items li ON li.invoice_id = i.id
        WHERE i.agency_id = _agency_id AND i.created_at >= _since GROUP BY 1
      ) r ON r.mo = m
    ), '[]'),
    'total_revenue', COALESCE((
      SELECT sum(li.amount)::numeric FROM invoices i JOIN invoice_line_items li ON li.invoice_id = i.id
      WHERE i.agency_id = _agency_id AND i.created_at >= _since
    ), 0),
    'weekly_breakdown', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('day', to_char(d, 'Dy'), 'count', COALESCE(c, 0)) ORDER BY d)
      FROM generate_series(_week_start, _week_start + interval '6 days', '1 day') d
      LEFT JOIN (
        SELECT date_trunc('day', scheduled_start) dy, count(*)::int c
        FROM appointments WHERE agency_id = _agency_id
          AND is_import_staged = false AND is_deleted = false
          AND scheduled_start >= _week_start AND scheduled_start < _week_start + interval '7 days'
        GROUP BY 1
      ) a ON a.dy = d
    ), '[]')
  );
END;
$function$;

-- 6. Update cancel_stale_reminders to exclude staged/deleted
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
        AND (a.status IN ('cancelled', 'no_show') OR a.is_deleted = true OR a.is_import_staged = true)
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

-- 7. Helper function: check if a batch can be rolled back
CREATE OR REPLACE FUNCTION public.check_rollback_dependencies(_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _result jsonb := '{"can_rollback": true, "blockers": []}'::jsonb;
  _blocker_count int;
BEGIN
  -- Check if any appointments created by this batch are referenced by
  -- records from OUTSIDE this batch (e.g., invoice line items, notification logs)
  SELECT count(*) INTO _blocker_count
  FROM import_batch_rows br
  JOIN appointments a ON a.id = br.target_record_id
  WHERE br.batch_id = _batch_id
    AND br.action_taken = 'created'
    AND (
      EXISTS (SELECT 1 FROM invoice_line_items ili WHERE ili.appointment_id = a.id)
      OR EXISTS (SELECT 1 FROM notification_log nl WHERE nl.appointment_id = a.id AND nl.status = 'sent')
    );

  IF _blocker_count > 0 THEN
    _result := jsonb_build_object(
      'can_rollback', false,
      'blockers', jsonb_build_array(
        jsonb_build_object('type', 'external_references', 'count', _blocker_count,
          'message', _blocker_count || ' imported records are referenced by invoices or sent notifications')
      )
    );
  END IF;

  -- Check if records were modified after import
  SELECT count(*) INTO _blocker_count
  FROM import_batch_rows br
  JOIN import_batches b ON b.id = br.batch_id
  JOIN appointments a ON a.id = br.target_record_id
  WHERE br.batch_id = _batch_id
    AND br.action_taken IN ('created', 'updated')
    AND a.updated_at > b.completed_at;

  IF _blocker_count > 0 THEN
    _result := jsonb_set(_result, '{can_rollback}', 'false'::jsonb);
    _result := jsonb_set(_result, '{blockers}',
      COALESCE(_result->'blockers', '[]'::jsonb) || jsonb_build_array(
        jsonb_build_object('type', 'modified_after_import', 'count', _blocker_count,
          'message', _blocker_count || ' records were modified after import and may lose manual changes')
      )
    );
  END IF;

  RETURN _result;
END;
$function$;
