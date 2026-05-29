
CREATE OR REPLACE FUNCTION public.get_platform_revenue(_months integer DEFAULT 6)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _since timestamptz := date_trunc('month', now() - make_interval(months => _months));
BEGIN
  IF NOT is_platform_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN jsonb_build_object(
    'agency_summaries', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'agency_id', a.id, 'agency_name', a.name,
        'plan_type', a.plan_type, 'billing_model', a.billing_model,
        'payment_terms', a.payment_terms,
        'total_appointments', COALESCE(t.total, 0),
        'completed_appointments', COALESCE(t.completed, 0),
        'invoiced_total', COALESCE(inv.total, 0),
        'usage_billing_trigger', COALESCE(pbc.usage_billing_trigger, 'completed'),
        'platform_usage_count', COALESCE(pu.cnt, 0),
        'platform_fees', COALESCE(pu.fees, 0),
        'monthly_base_fee', COALESCE(pbc.monthly_base_fee, 0),
        'per_appointment_fee', COALESCE(pbc.per_appointment_fee, 0)
      ) ORDER BY COALESCE(t.total, 0) DESC)
      FROM agencies a
      LEFT JOIN (
        SELECT agency_id, count(*)::int total,
          count(*) FILTER (WHERE status = 'completed')::int completed
        FROM appointments
        WHERE is_deleted = false AND is_import_staged = false AND scheduled_start >= _since
        GROUP BY agency_id
      ) t ON t.agency_id = a.id
      LEFT JOIN (
        SELECT agency_id, sum(total)::numeric total
        FROM invoices WHERE created_at >= _since GROUP BY agency_id
      ) inv ON inv.agency_id = a.id
      LEFT JOIN platform_billing_config pbc ON pbc.agency_id = a.id
      LEFT JOIN (
        SELECT agency_id, count(*)::int cnt, sum(fee_amount)::numeric fees
        FROM platform_usage_log WHERE created_at >= _since
        GROUP BY agency_id
      ) pu ON pu.agency_id = a.id
    ), '[]'),
    'monthly_platform_totals', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'month', to_char(m, 'YYYY-MM'),
        'appointments', COALESCE(c, 0),
        'completed', COALESCE(cc, 0),
        'invoiced', COALESCE(iv, 0),
        'platform_usage', COALESCE(pu_cnt, 0),
        'platform_fees', COALESCE(pu_fees, 0)
      ) ORDER BY m)
      FROM generate_series(_since, date_trunc('month', now()), '1 month') m
      LEFT JOIN (
        SELECT date_trunc('month', scheduled_start) mo,
          count(*)::int c,
          count(*) FILTER (WHERE status = 'completed')::int cc
        FROM appointments
        WHERE is_deleted = false AND is_import_staged = false AND scheduled_start >= _since
        GROUP BY 1
      ) a ON a.mo = m
      LEFT JOIN (
        SELECT date_trunc('month', created_at) mo, sum(total)::numeric iv
        FROM invoices WHERE created_at >= _since GROUP BY 1
      ) i ON i.mo = m
      LEFT JOIN (
        SELECT billing_month::date mo, count(*)::int pu_cnt, sum(fee_amount)::numeric pu_fees
        FROM platform_usage_log WHERE created_at >= _since
        GROUP BY billing_month
      ) pu ON pu.mo = m
    ), '[]')
  );
END;
$$;
