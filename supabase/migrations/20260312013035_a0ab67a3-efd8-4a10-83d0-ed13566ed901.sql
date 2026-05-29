
CREATE OR REPLACE FUNCTION public.get_report_data()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
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
      FROM (SELECT status, count(*)::int cnt FROM appointments WHERE agency_id = _agency_id AND scheduled_start >= _since GROUP BY status) x
    ), '{}'),
    'total_appointments', (SELECT count(*)::int FROM appointments WHERE agency_id = _agency_id AND scheduled_start >= _since),
    'completed_count', (SELECT count(*)::int FROM appointments WHERE agency_id = _agency_id AND scheduled_start >= _since AND status = 'completed'),
    'active_interpreters', (SELECT count(DISTINCT interpreter_id)::int FROM appointments WHERE agency_id = _agency_id AND scheduled_start >= _since AND interpreter_id IS NOT NULL AND status = 'completed'),
    'monthly_trends', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('month', to_char(m, 'Mon YYYY'), 'count', COALESCE(c, 0)) ORDER BY m)
      FROM generate_series(_since, date_trunc('month', now()), '1 month') m
      LEFT JOIN (
        SELECT date_trunc('month', scheduled_start) mo, count(*)::int c
        FROM appointments WHERE agency_id = _agency_id AND scheduled_start >= _since GROUP BY 1
      ) a ON a.mo = m
    ), '[]'),
    'language_distribution', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('name', name, 'value', cnt) ORDER BY cnt DESC)
      FROM (
        SELECT COALESCE(l.name, 'Unknown') name, count(*)::int cnt
        FROM appointments a LEFT JOIN languages l ON l.id = a.language_id
        WHERE a.agency_id = _agency_id AND a.scheduled_start >= _since
        GROUP BY l.name ORDER BY cnt DESC LIMIT 7
      ) x
    ), '[]'),
    'interpreter_utilization', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('name', name, 'count', cnt) ORDER BY cnt DESC)
      FROM (
        SELECT p.first_name || ' ' || p.last_name name, count(*)::int cnt
        FROM appointments a JOIN profiles p ON p.id = a.interpreter_id
        WHERE a.agency_id = _agency_id AND a.scheduled_start >= _since AND a.interpreter_id IS NOT NULL AND a.status = 'completed'
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
          AND scheduled_start >= _week_start AND scheduled_start < _week_start + interval '7 days'
        GROUP BY 1
      ) a ON a.dy = d
    ), '[]')
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_report_data() TO authenticated;
