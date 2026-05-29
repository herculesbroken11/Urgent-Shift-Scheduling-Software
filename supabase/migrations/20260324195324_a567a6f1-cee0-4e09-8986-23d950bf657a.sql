
CREATE OR REPLACE FUNCTION get_platform_revenue(
  _months int DEFAULT 6,
  _date_from text DEFAULT NULL,
  _date_to text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _since timestamptz;
  _until timestamptz;
  _config_anchor date;
BEGIN
  IF NOT is_platform_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF _date_from IS NOT NULL THEN
    _since := _date_from::timestamptz;
    _until := COALESCE(_date_to::timestamptz + interval '1 day' - interval '1 second', now());
  ELSE
    _since := date_trunc('month', now() - make_interval(months => _months));
    _until := now();
  END IF;

  -- Use the END of the queried period to find the config that was active then,
  -- not CURRENT_DATE which would be wrong for historical queries
  _config_anchor := _until::date;

  RETURN jsonb_build_object(
    'query_timeframe', jsonb_build_object('since', _since, 'until', _until),
    'agency_summaries', COALESCE((
      SELECT jsonb_agg(sub ORDER BY sub->>'agency_name')
      FROM (
        SELECT jsonb_build_object(
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
          'per_appointment_fee', COALESCE(pbc.per_appointment_fee, 0),
          'min_monthly_fee', COALESCE(pbc.min_monthly_fee, 0),
          'max_monthly_fee', COALESCE(pbc.max_monthly_fee, 0),
          'config_id', pbc.id,
          'config_effective_start', pbc.effective_start_date,
          'config_effective_end', pbc.effective_end_date,
          'computed_revenue', CASE
            WHEN pbc.billing_model = 'flat' THEN pbc.monthly_base_fee
            WHEN pbc.billing_model = 'per_appointment' THEN
              pbc.monthly_base_fee + (COALESCE(pu.cnt, 0) * pbc.per_appointment_fee)
            WHEN pbc.billing_model = 'tiered' THEN
              pbc.monthly_base_fee +
              GREATEST(0, COALESCE(pu.cnt, 0) - pbc.included_appointments) * pbc.overage_rate
            ELSE COALESCE(pu.fees, 0)
          END,
          'min_fee_applied', CASE
            WHEN pbc.min_monthly_fee IS NOT NULL AND pbc.min_monthly_fee > 0 THEN
              (CASE
                WHEN pbc.billing_model = 'per_appointment' THEN
                  pbc.monthly_base_fee + (COALESCE(pu.cnt, 0) * pbc.per_appointment_fee)
                WHEN pbc.billing_model = 'tiered' THEN
                  pbc.monthly_base_fee +
                  GREATEST(0, COALESCE(pu.cnt, 0) - pbc.included_appointments) * pbc.overage_rate
                ELSE COALESCE(pu.fees, 0)
              END) < pbc.min_monthly_fee
            ELSE false
          END,
          'max_fee_applied', CASE
            WHEN pbc.max_monthly_fee IS NOT NULL AND pbc.max_monthly_fee > 0 THEN
              (CASE
                WHEN pbc.billing_model = 'per_appointment' THEN
                  pbc.monthly_base_fee + (COALESCE(pu.cnt, 0) * pbc.per_appointment_fee)
                WHEN pbc.billing_model = 'tiered' THEN
                  pbc.monthly_base_fee +
                  GREATEST(0, COALESCE(pu.cnt, 0) - pbc.included_appointments) * pbc.overage_rate
                ELSE COALESCE(pu.fees, 0)
              END) > pbc.max_monthly_fee
            ELSE false
          END,
          'has_invoice', COALESCE(pinv.has_invoice, false),
          'invoice_status', pinv.invoice_status,
          'invoice_id', pinv.invoice_id
        ) as sub, COALESCE(t.total, 0) as total_appointments
        FROM agencies a
        LEFT JOIN (
          SELECT agency_id, count(*)::int total,
            count(*) FILTER (WHERE status = 'completed')::int completed
          FROM appointments
          WHERE is_deleted = false AND is_import_staged = false
            AND scheduled_start >= _since AND scheduled_start <= _until
          GROUP BY agency_id
        ) t ON t.agency_id = a.id
        LEFT JOIN (
          SELECT agency_id, sum(total)::numeric total
          FROM invoices WHERE created_at >= _since AND created_at <= _until GROUP BY agency_id
        ) inv ON inv.agency_id = a.id
        LEFT JOIN LATERAL (
          SELECT * FROM platform_billing_config pc
          WHERE pc.agency_id = a.id
            AND pc.effective_start_date <= _config_anchor
            AND (pc.effective_end_date IS NULL OR pc.effective_end_date >= (_since::date))
            AND pc.is_active = true
          ORDER BY pc.effective_start_date DESC
          LIMIT 1
        ) pbc ON true
        LEFT JOIN (
          SELECT agency_id, count(*)::int cnt, sum(fee_amount)::numeric fees
          FROM platform_usage_log WHERE created_at >= _since AND created_at <= _until
          GROUP BY agency_id
        ) pu ON pu.agency_id = a.id
        LEFT JOIN LATERAL (
          SELECT true as has_invoice, pi.status as invoice_status, pi.id as invoice_id
          FROM platform_invoices pi
          WHERE pi.agency_id = a.id
            AND pi.billing_month >= to_char(_since, 'YYYY-MM')
            AND pi.billing_month <= to_char(_until, 'YYYY-MM')
          ORDER BY pi.billing_month DESC
          LIMIT 1
        ) pinv ON true
      ) calc
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
      FROM generate_series(
        date_trunc('month', _since),
        date_trunc('month', _until),
        '1 month'
      ) m
      LEFT JOIN (
        SELECT date_trunc('month', scheduled_start) mo,
          count(*)::int c,
          count(*) FILTER (WHERE status = 'completed')::int cc
        FROM appointments
        WHERE is_deleted = false AND is_import_staged = false
          AND scheduled_start >= _since AND scheduled_start <= _until
        GROUP BY 1
      ) a ON a.mo = m
      LEFT JOIN (
        SELECT date_trunc('month', created_at) mo, sum(total)::numeric iv
        FROM invoices WHERE created_at >= _since AND created_at <= _until GROUP BY 1
      ) i ON i.mo = m
      LEFT JOIN (
        SELECT billing_month::date mo, count(*)::int pu_cnt, sum(fee_amount)::numeric pu_fees
        FROM platform_usage_log WHERE created_at >= _since AND created_at <= _until
        GROUP BY billing_month
      ) pu ON pu.mo = m
    ), '[]')
  );
END;
$$;
