CREATE OR REPLACE FUNCTION public.get_dashboard_counts(
  _agency_id uuid,
  _statuses text[],
  _interpreter_id uuid DEFAULT NULL,
  _customer_id uuid DEFAULT NULL,
  _date_from timestamptz DEFAULT NULL,
  _date_to timestamptz DEFAULT NULL
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
      AND (_date_from IS NULL OR scheduled_start >= _date_from)
      AND (_date_to IS NULL OR scheduled_start <= _date_to)
    GROUP BY status::text
  ) t;
$$;