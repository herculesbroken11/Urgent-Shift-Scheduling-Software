CREATE OR REPLACE FUNCTION public.search_appointments(
  _status text DEFAULT NULL,
  _date_from timestamptz DEFAULT NULL,
  _date_to timestamptz DEFAULT NULL,
  _search text DEFAULT NULL,
  _assignment text DEFAULT 'all',
  _page_size int DEFAULT 50,
  _page int DEFAULT 0,
  _statuses text[] DEFAULT NULL
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
    AND (
      (_statuses IS NOT NULL AND a.status::text = ANY(_statuses))
      OR (_statuses IS NULL AND (_status IS NULL OR a.status::text = _status))
    )
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
      a.category,
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
      AND (
        (_statuses IS NOT NULL AND a.status::text = ANY(_statuses))
        OR (_statuses IS NULL AND (_status IS NULL OR a.status::text = _status))
      )
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
      'category', pd.category,
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