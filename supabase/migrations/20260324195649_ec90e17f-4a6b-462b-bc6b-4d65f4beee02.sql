
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

  RETURN jsonb_build_object(
    'query_timeframe', jsonb_build_object('since', _since, 'until', _until),
    'agency_summaries', COALESCE((
      SELECT jsonb_agg(agg ORDER BY agg->>'agency_name')
      FROM (
        SELECT jsonb_build_object(
          'agency_id', agency_id,
          'agency_name', agency_name,
          'plan_type', plan_type,
          'billing_model', billing_model,
          'payment_terms', payment_terms,
          'total_appointments', total_appointments,
          'completed_appointments', completed_appointments,
          'invoiced_total', invoiced_total,
          'platform_usage_count', platform_usage_count,
          'platform_fees', platform_fees,
          'computed_revenue', computed_revenue,
          'has_invoice', has_invoice,
          'invoice_status', invoice_status,
          'invoice_id', invoice_id,
          'config_segments', config_segments
        ) as agg
        FROM (
          -- Aggregate per-month results back to per-agency
          SELECT
            am.agency_id,
            am.agency_name,
            am.plan_type,
            am.billing_model as billing_model,
            am.payment_terms,
            sum(am.month_appointments)::int as total_appointments,
            sum(am.month_completed)::int as completed_appointments,
            am.invoiced_total,
            sum(am.month_usage_count)::int as platform_usage_count,
            sum(am.month_usage_fees)::numeric as platform_fees,
            sum(am.month_revenue)::numeric as computed_revenue,
            am.has_invoice,
            am.invoice_status,
            am.invoice_id,
            -- Build config_segments: array of distinct configs with their months
            (
              SELECT COALESCE(jsonb_agg(seg ORDER BY seg->>'first_month'), '[]'::jsonb)
              FROM (
                SELECT jsonb_build_object(
                  'config_id', cfg_id,
                  'effective_start', cfg_start,
                  'effective_end', cfg_end,
                  'billing_model', cfg_billing_model,
                  'monthly_base_fee', cfg_base,
                  'per_appointment_fee', cfg_per_appt,
                  'included_appointments', cfg_included,
                  'overage_rate', cfg_overage,
                  'min_monthly_fee', cfg_min,
                  'max_monthly_fee', cfg_max,
                  'usage_billing_trigger', cfg_trigger,
                  'first_month', min(am2.month_label),
                  'last_month', max(am2.month_label),
                  'months_count', count(*),
                  'usage_count', sum(am2.month_usage_count),
                  'revenue', sum(am2.month_revenue)
                ) as seg
                FROM (
                  -- Re-derive per-month config for this agency to group by config_id
                  SELECT
                    mo.month_label,
                    pc2.id as cfg_id,
                    pc2.effective_start_date as cfg_start,
                    pc2.effective_end_date as cfg_end,
                    pc2.billing_model as cfg_billing_model,
                    pc2.monthly_base_fee as cfg_base,
                    pc2.per_appointment_fee as cfg_per_appt,
                    pc2.included_appointments as cfg_included,
                    pc2.overage_rate as cfg_overage,
                    pc2.min_monthly_fee as cfg_min,
                    pc2.max_monthly_fee as cfg_max,
                    pc2.usage_billing_trigger as cfg_trigger,
                    COALESCE(mu2.cnt, 0) as month_usage_count,
                    -- Revenue calculation per month
                    CASE
                      WHEN pc2.id IS NULL THEN 0
                      WHEN pc2.max_monthly_fee IS NOT NULL AND pc2.max_monthly_fee > 0
                        AND (CASE
                          WHEN pc2.billing_model = 'flat' THEN pc2.monthly_base_fee
                          WHEN pc2.billing_model = 'per_appointment' THEN pc2.monthly_base_fee + COALESCE(mu2.cnt,0) * pc2.per_appointment_fee
                          WHEN pc2.billing_model = 'tiered' THEN pc2.monthly_base_fee + GREATEST(0, COALESCE(mu2.cnt,0) - pc2.included_appointments) * pc2.overage_rate
                          ELSE COALESCE(mu2.fees, 0)
                        END) > pc2.max_monthly_fee
                        THEN pc2.max_monthly_fee
                      WHEN pc2.min_monthly_fee IS NOT NULL AND pc2.min_monthly_fee > 0
                        AND (CASE
                          WHEN pc2.billing_model = 'flat' THEN pc2.monthly_base_fee
                          WHEN pc2.billing_model = 'per_appointment' THEN pc2.monthly_base_fee + COALESCE(mu2.cnt,0) * pc2.per_appointment_fee
                          WHEN pc2.billing_model = 'tiered' THEN pc2.monthly_base_fee + GREATEST(0, COALESCE(mu2.cnt,0) - pc2.included_appointments) * pc2.overage_rate
                          ELSE COALESCE(mu2.fees, 0)
                        END) < pc2.min_monthly_fee
                        THEN pc2.min_monthly_fee
                      ELSE
                        CASE
                          WHEN pc2.billing_model = 'flat' THEN pc2.monthly_base_fee
                          WHEN pc2.billing_model = 'per_appointment' THEN pc2.monthly_base_fee + COALESCE(mu2.cnt,0) * pc2.per_appointment_fee
                          WHEN pc2.billing_model = 'tiered' THEN pc2.monthly_base_fee + GREATEST(0, COALESCE(mu2.cnt,0) - pc2.included_appointments) * pc2.overage_rate
                          ELSE COALESCE(mu2.fees, 0)
                        END
                    END as month_revenue
                  FROM (
                    SELECT to_char(gs, 'YYYY-MM') as month_label, gs::date as month_date
                    FROM generate_series(date_trunc('month', _since), date_trunc('month', _until), '1 month') gs
                  ) mo
                  LEFT JOIN LATERAL (
                    SELECT * FROM platform_billing_config pc
                    WHERE pc.agency_id = am.agency_id
                      AND pc.effective_start_date <= (mo.month_date + interval '1 month' - interval '1 day')::date
                      AND (pc.effective_end_date IS NULL OR pc.effective_end_date >= mo.month_date)
                      AND pc.is_active = true
                    ORDER BY pc.effective_start_date DESC
                    LIMIT 1
                  ) pc2 ON true
                  LEFT JOIN (
                    SELECT billing_month, count(*)::int cnt, sum(fee_amount)::numeric fees
                    FROM platform_usage_log
                    WHERE agency_id = am.agency_id AND created_at >= _since AND created_at <= _until
                    GROUP BY billing_month
                  ) mu2 ON mu2.billing_month = mo.month_label
                ) am2
                GROUP BY cfg_id, cfg_start, cfg_end, cfg_billing_model, cfg_base, cfg_per_appt, cfg_included, cfg_overage, cfg_min, cfg_max, cfg_trigger
              ) seg_inner
            ) as config_segments
          FROM (
            -- Per agency per month: find config, usage, appointments
            SELECT
              a.id as agency_id,
              a.name as agency_name,
              a.plan_type,
              a.billing_model,
              a.payment_terms,
              mo.month_label,
              COALESCE(ma.cnt, 0) as month_appointments,
              COALESCE(ma.completed, 0) as month_completed,
              COALESCE(mu.cnt, 0) as month_usage_count,
              COALESCE(mu.fees, 0) as month_usage_fees,
              -- Revenue per month using correct config
              CASE
                WHEN pbc.id IS NULL THEN 0
                WHEN pbc.max_monthly_fee IS NOT NULL AND pbc.max_monthly_fee > 0
                  AND (CASE
                    WHEN pbc.billing_model = 'flat' THEN pbc.monthly_base_fee
                    WHEN pbc.billing_model = 'per_appointment' THEN pbc.monthly_base_fee + COALESCE(mu.cnt,0) * pbc.per_appointment_fee
                    WHEN pbc.billing_model = 'tiered' THEN pbc.monthly_base_fee + GREATEST(0, COALESCE(mu.cnt,0) - pbc.included_appointments) * pbc.overage_rate
                    ELSE COALESCE(mu.fees, 0)
                  END) > pbc.max_monthly_fee
                  THEN pbc.max_monthly_fee
                WHEN pbc.min_monthly_fee IS NOT NULL AND pbc.min_monthly_fee > 0
                  AND (CASE
                    WHEN pbc.billing_model = 'flat' THEN pbc.monthly_base_fee
                    WHEN pbc.billing_model = 'per_appointment' THEN pbc.monthly_base_fee + COALESCE(mu.cnt,0) * pbc.per_appointment_fee
                    WHEN pbc.billing_model = 'tiered' THEN pbc.monthly_base_fee + GREATEST(0, COALESCE(mu.cnt,0) - pbc.included_appointments) * pbc.overage_rate
                    ELSE COALESCE(mu.fees, 0)
                  END) < pbc.min_monthly_fee
                  THEN pbc.min_monthly_fee
                ELSE
                  CASE
                    WHEN pbc.billing_model = 'flat' THEN pbc.monthly_base_fee
                    WHEN pbc.billing_model = 'per_appointment' THEN pbc.monthly_base_fee + COALESCE(mu.cnt,0) * pbc.per_appointment_fee
                    WHEN pbc.billing_model = 'tiered' THEN pbc.monthly_base_fee + GREATEST(0, COALESCE(mu.cnt,0) - pbc.included_appointments) * pbc.overage_rate
                    ELSE COALESCE(mu.fees, 0)
                  END
              END as month_revenue,
              inv.total as invoiced_total,
              pinv.has_invoice,
              pinv.invoice_status,
              pinv.invoice_id
            FROM agencies a
            CROSS JOIN (
              SELECT to_char(gs, 'YYYY-MM') as month_label, gs::date as month_date
              FROM generate_series(date_trunc('month', _since), date_trunc('month', _until), '1 month') gs
            ) mo
            -- Config active for THIS month
            LEFT JOIN LATERAL (
              SELECT * FROM platform_billing_config pc
              WHERE pc.agency_id = a.id
                AND pc.effective_start_date <= (mo.month_date + interval '1 month' - interval '1 day')::date
                AND (pc.effective_end_date IS NULL OR pc.effective_end_date >= mo.month_date)
                AND pc.is_active = true
              ORDER BY pc.effective_start_date DESC
              LIMIT 1
            ) pbc ON true
            -- Appointments for this month
            LEFT JOIN (
              SELECT agency_id, to_char(date_trunc('month', scheduled_start), 'YYYY-MM') as mo,
                count(*)::int cnt,
                count(*) FILTER (WHERE status = 'completed')::int completed
              FROM appointments
              WHERE is_deleted = false AND is_import_staged = false
                AND scheduled_start >= _since AND scheduled_start <= _until
              GROUP BY agency_id, 2
            ) ma ON ma.agency_id = a.id AND ma.mo = mo.month_label
            -- Usage for this month
            LEFT JOIN (
              SELECT agency_id, billing_month, count(*)::int cnt, sum(fee_amount)::numeric fees
              FROM platform_usage_log
              WHERE created_at >= _since AND created_at <= _until
              GROUP BY agency_id, billing_month
            ) mu ON mu.agency_id = a.id AND mu.billing_month = mo.month_label
            -- Invoice totals (once per agency, not per month)
            LEFT JOIN LATERAL (
              SELECT sum(total)::numeric total
              FROM invoices WHERE agency_id = a.id AND created_at >= _since AND created_at <= _until
            ) inv ON true
            -- Platform invoice status
            LEFT JOIN LATERAL (
              SELECT true as has_invoice, pi.status as invoice_status, pi.id as invoice_id
              FROM platform_invoices pi
              WHERE pi.agency_id = a.id
                AND pi.billing_month >= to_char(_since, 'YYYY-MM')
                AND pi.billing_month <= to_char(_until, 'YYYY-MM')
              ORDER BY pi.billing_month DESC
              LIMIT 1
            ) pinv ON true
          ) am
          GROUP BY am.agency_id, am.agency_name, am.plan_type, am.billing_model, am.payment_terms,
                   am.invoiced_total, am.has_invoice, am.invoice_status, am.invoice_id
        ) final_agg
      ) outer_agg
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
