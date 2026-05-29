
CREATE OR REPLACE FUNCTION public.get_dashboard_counts(
  _agency_id uuid,
  _statuses text[],
  _interpreter_id uuid DEFAULT NULL,
  _customer_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_object_agg(status::text, cnt), '{}'::jsonb)
  FROM (
    SELECT status, count(*)::int as cnt
    FROM appointments
    WHERE agency_id = _agency_id
      AND status::text = ANY(_statuses)
      AND scheduled_start >= date_trunc('day', now())
      AND (_interpreter_id IS NULL OR interpreter_id = _interpreter_id)
      AND (_customer_id IS NULL OR customer_id = _customer_id)
    GROUP BY status
  ) t;
$$;
