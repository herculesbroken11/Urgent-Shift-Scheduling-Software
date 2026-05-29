
-- Platform roles table (global, not agency-scoped)
CREATE TABLE IF NOT EXISTS public.platform_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'platform_owner',
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

-- Security definer to check platform ownership (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.is_platform_owner(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_roles
    WHERE user_id = _user_id AND role = 'platform_owner'
  )
$$;

-- RLS for platform_roles
ALTER TABLE public.platform_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform owners manage roles"
  ON public.platform_roles FOR ALL TO authenticated
  USING (is_platform_owner(auth.uid()))
  WITH CHECK (is_platform_owner(auth.uid()));

CREATE POLICY "Users view own platform role"
  ON public.platform_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Agency metadata columns for platform management
ALTER TABLE public.agencies
  ADD COLUMN IF NOT EXISTS agency_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS plan_type text NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS billing_model text NOT NULL DEFAULT 'per_appointment',
  ADD COLUMN IF NOT EXISTS payment_terms text NOT NULL DEFAULT 'net_30',
  ADD COLUMN IF NOT EXISTS contract_start_date date,
  ADD COLUMN IF NOT EXISTS contract_end_date date,
  ADD COLUMN IF NOT EXISTS feature_flags jsonb NOT NULL DEFAULT '{"self_claim":true,"reminders":true,"import_platform":true,"qbo_direct_sync":false,"csv_mode":true,"security_dashboard":false,"regions":true,"dynamic_statuses":true,"pilot_features":false}'::jsonb,
  ADD COLUMN IF NOT EXISTS platform_notes text;

-- Platform audit log
CREATE TABLE IF NOT EXISTS public.platform_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform owners access audit log"
  ON public.platform_audit_log FOR ALL TO authenticated
  USING (is_platform_owner(auth.uid()));

-- Support sessions
CREATE TABLE IF NOT EXISTS public.support_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_user_id uuid NOT NULL,
  agency_id uuid NOT NULL REFERENCES public.agencies(id),
  reason text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  actions_log jsonb DEFAULT '[]'::jsonb
);

ALTER TABLE public.support_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform owners manage support sessions"
  ON public.support_sessions FOR ALL TO authenticated
  USING (is_platform_owner(auth.uid()));

-- Helper to log platform audit actions
CREATE OR REPLACE FUNCTION public.log_platform_action(
  _action text, _target_type text, _target_id text DEFAULT NULL, _details jsonb DEFAULT '{}'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO platform_audit_log (actor_id, action, target_type, target_id, details)
  VALUES (auth.uid(), _action, _target_type, _target_id, _details);
END;
$$;

-- RPC: Platform dashboard stats
CREATE OR REPLACE FUNCTION public.get_platform_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_platform_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN jsonb_build_object(
    'total_agencies', (SELECT count(*)::int FROM agencies),
    'active_agencies', (SELECT count(*)::int FROM agencies WHERE agency_status = 'active'),
    'trial_agencies', (SELECT count(*)::int FROM agencies WHERE agency_status = 'trial'),
    'suspended_agencies', (SELECT count(*)::int FROM agencies WHERE agency_status = 'suspended'),
    'cancelled_agencies', (SELECT count(*)::int FROM agencies WHERE agency_status = 'cancelled'),
    'total_users', (SELECT count(*)::int FROM profiles WHERE is_deleted = false),
    'users_by_role', COALESCE((
      SELECT jsonb_object_agg(role::text, cnt)
      FROM (SELECT role, count(*)::int cnt FROM user_roles GROUP BY role) x
    ), '{}'),
    'monthly_appointments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'month', to_char(m, 'YYYY-MM'),
        'total', COALESCE(c, 0),
        'completed', COALESCE(cc, 0)
      ) ORDER BY m)
      FROM generate_series(
        date_trunc('month', now() - interval '11 months'),
        date_trunc('month', now()),
        '1 month'
      ) m
      LEFT JOIN (
        SELECT date_trunc('month', scheduled_start) mo,
          count(*)::int c,
          count(*) FILTER (WHERE status = 'completed')::int cc
        FROM appointments
        WHERE is_import_staged = false AND is_deleted = false
          AND scheduled_start >= date_trunc('month', now() - interval '11 months')
        GROUP BY 1
      ) a ON a.mo = m
    ), '[]'),
    'failed_syncs_30d', (SELECT count(*)::int FROM qbo_sync_log WHERE status = 'failed' AND created_at >= now() - interval '30 days'),
    'failed_imports_30d', (SELECT count(*)::int FROM import_batches WHERE status = 'failed' AND created_at >= now() - interval '30 days'),
    'failed_notifications_30d', (SELECT count(*)::int FROM notification_log WHERE status = 'failed' AND created_at >= now() - interval '30 days')
  );
END;
$$;

-- RPC: All agencies with stats
CREATE OR REPLACE FUNCTION public.get_platform_agencies()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_platform_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', a.id, 'name', a.name, 'slug', a.slug,
      'agency_status', a.agency_status, 'plan_type', a.plan_type,
      'billing_model', a.billing_model, 'payment_terms', a.payment_terms,
      'contract_start_date', a.contract_start_date,
      'contract_end_date', a.contract_end_date,
      'feature_flags', a.feature_flags,
      'email', a.email, 'phone', a.phone,
      'timezone', a.timezone,
      'created_at', a.created_at,
      'user_count', COALESCE(uc.cnt, 0),
      'appointment_count', COALESCE(ac.cnt, 0),
      'this_month_appointments', COALESCE(mc.cnt, 0)
    ) ORDER BY a.created_at DESC)
    FROM agencies a
    LEFT JOIN (
      SELECT agency_id, count(*)::int cnt FROM profiles
      WHERE is_deleted = false AND agency_id IS NOT NULL GROUP BY agency_id
    ) uc ON uc.agency_id = a.id
    LEFT JOIN (
      SELECT agency_id, count(*)::int cnt FROM appointments
      WHERE is_deleted = false AND is_import_staged = false GROUP BY agency_id
    ) ac ON ac.agency_id = a.id
    LEFT JOIN (
      SELECT agency_id, count(*)::int cnt FROM appointments
      WHERE is_deleted = false AND is_import_staged = false
        AND scheduled_start >= date_trunc('month', now()) GROUP BY agency_id
    ) mc ON mc.agency_id = a.id
  ), '[]');
END;
$$;

-- RPC: Search all users across agencies
CREATE OR REPLACE FUNCTION public.search_platform_users(
  _search text DEFAULT NULL, _agency_id uuid DEFAULT NULL,
  _role text DEFAULT NULL, _page int DEFAULT 0, _page_size int DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _total int;
  _rows jsonb;
  _off int := _page * _page_size;
BEGIN
  IF NOT is_platform_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT count(DISTINCT p.id) INTO _total
  FROM profiles p
  LEFT JOIN user_roles ur ON ur.user_id = p.id
  WHERE p.is_deleted = false
    AND (_agency_id IS NULL OR p.agency_id = _agency_id)
    AND (_role IS NULL OR ur.role::text = _role)
    AND (_search IS NULL OR _search = ''
      OR p.first_name ILIKE '%' || _search || '%'
      OR p.last_name ILIKE '%' || _search || '%'
      OR p.email ILIKE '%' || _search || '%');

  SELECT COALESCE(jsonb_agg(row_data), '[]') INTO _rows
  FROM (
    SELECT jsonb_build_object(
      'id', p.id, 'first_name', p.first_name, 'last_name', p.last_name,
      'email', p.email, 'phone', p.phone,
      'agency_id', p.agency_id, 'agency_name', ag.name,
      'is_active', p.is_active, 'created_at', p.created_at,
      'roles', COALESCE((SELECT jsonb_agg(ur2.role) FROM user_roles ur2 WHERE ur2.user_id = p.id), '[]')
    ) as row_data
    FROM profiles p
    LEFT JOIN agencies ag ON ag.id = p.agency_id
    LEFT JOIN user_roles ur ON ur.user_id = p.id
    WHERE p.is_deleted = false
      AND (_agency_id IS NULL OR p.agency_id = _agency_id)
      AND (_role IS NULL OR ur.role::text = _role)
      AND (_search IS NULL OR _search = ''
        OR p.first_name ILIKE '%' || _search || '%'
        OR p.last_name ILIKE '%' || _search || '%'
        OR p.email ILIKE '%' || _search || '%')
    GROUP BY p.id, p.first_name, p.last_name, p.email, p.phone,
             p.agency_id, ag.name, p.is_active, p.created_at
    ORDER BY p.created_at DESC
    LIMIT _page_size OFFSET _off
  ) sub;

  RETURN jsonb_build_object('data', _rows, 'total_count', _total);
END;
$$;

-- RPC: Platform revenue overview
CREATE OR REPLACE FUNCTION public.get_platform_revenue(_months int DEFAULT 6)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
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
        'invoiced_total', COALESCE(inv.total, 0)
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
    ), '[]'),
    'monthly_platform_totals', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'month', to_char(m, 'YYYY-MM'),
        'appointments', COALESCE(c, 0),
        'completed', COALESCE(cc, 0),
        'invoiced', COALESCE(iv, 0)
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
    ), '[]')
  );
END;
$$;

-- RPC: Platform diagnostics
CREATE OR REPLACE FUNCTION public.get_platform_diagnostics()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_platform_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN jsonb_build_object(
    'failed_imports', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', ib.id, 'agency_name', a.name,
        'entity_type', ib.entity_type, 'filename', ib.uploaded_filename,
        'status', ib.status, 'created_at', ib.created_at,
        'error_log', ib.error_log
      ) ORDER BY ib.created_at DESC)
      FROM import_batches ib JOIN agencies a ON a.id = ib.agency_id
      WHERE ib.status = 'failed' AND ib.created_at >= now() - interval '30 days'
      LIMIT 50
    ), '[]'),
    'failed_syncs', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', sl.id, 'agency_name', a.name,
        'entity_type', sl.entity_type, 'action', sl.action,
        'error_details', sl.error_details, 'created_at', sl.created_at
      ) ORDER BY sl.created_at DESC)
      FROM qbo_sync_log sl JOIN agencies a ON a.id = sl.agency_id
      WHERE sl.status = 'failed' AND sl.created_at >= now() - interval '30 days'
      LIMIT 50
    ), '[]'),
    'failed_notifications', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', nl.id, 'agency_name', a.name,
        'channel', nl.channel, 'recipient', nl.recipient,
        'error_message', nl.error_message, 'created_at', nl.created_at
      ) ORDER BY nl.created_at DESC)
      FROM notification_log nl JOIN agencies a ON a.id = nl.agency_id
      WHERE nl.status = 'failed' AND nl.created_at >= now() - interval '30 days'
      LIMIT 50
    ), '[]'),
    'integration_health', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'agency_id', a.id, 'agency_name', a.name,
        'qbo_status', COALESCE(qc.connection_status, 'not_connected'),
        'gcal_connections', COALESCE(gc.cnt, 0)
      ))
      FROM agencies a
      LEFT JOIN qbo_connections qc ON qc.agency_id = a.id
      LEFT JOIN (SELECT agency_id, count(*)::int cnt FROM google_calendar_connections GROUP BY agency_id) gc ON gc.agency_id = a.id
    ), '[]')
  );
END;
$$;

-- RPC: Agency detail for platform
CREATE OR REPLACE FUNCTION public.get_platform_agency_detail(_agency_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_platform_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN jsonb_build_object(
    'agency', (
      SELECT jsonb_build_object(
        'id', a.id, 'name', a.name, 'slug', a.slug,
        'agency_status', a.agency_status, 'plan_type', a.plan_type,
        'billing_model', a.billing_model, 'payment_terms', a.payment_terms,
        'contract_start_date', a.contract_start_date,
        'contract_end_date', a.contract_end_date,
        'feature_flags', a.feature_flags,
        'email', a.email, 'phone', a.phone, 'website', a.website,
        'address', a.address, 'timezone', a.timezone,
        'platform_notes', a.platform_notes,
        'created_at', a.created_at
      ) FROM agencies a WHERE a.id = _agency_id
    ),
    'users', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'first_name', p.first_name, 'last_name', p.last_name,
        'email', p.email, 'is_active', p.is_active, 'created_at', p.created_at,
        'roles', COALESCE((SELECT jsonb_agg(ur.role) FROM user_roles ur WHERE ur.user_id = p.id), '[]')
      ))
      FROM profiles p WHERE p.agency_id = _agency_id AND p.is_deleted = false
    ), '[]'),
    'stats', jsonb_build_object(
      'total_appointments', (SELECT count(*)::int FROM appointments WHERE agency_id = _agency_id AND is_deleted = false AND is_import_staged = false),
      'this_month', (SELECT count(*)::int FROM appointments WHERE agency_id = _agency_id AND is_deleted = false AND is_import_staged = false AND scheduled_start >= date_trunc('month', now())),
      'completed', (SELECT count(*)::int FROM appointments WHERE agency_id = _agency_id AND is_deleted = false AND is_import_staged = false AND status = 'completed'),
      'customers', (SELECT count(*)::int FROM customers WHERE agency_id = _agency_id AND is_deleted = false),
      'interpreters', (SELECT count(DISTINCT p.id)::int FROM profiles p JOIN user_roles ur ON ur.user_id = p.id WHERE p.agency_id = _agency_id AND ur.role = 'interpreter' AND p.is_deleted = false)
    ),
    'support_sessions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', ss.id, 'reason', ss.reason,
        'started_at', ss.started_at, 'ended_at', ss.ended_at,
        'actor_name', COALESCE(p.first_name || ' ' || p.last_name, p.email)
      ) ORDER BY ss.started_at DESC)
      FROM support_sessions ss
      LEFT JOIN profiles p ON p.id = ss.platform_user_id
      WHERE ss.agency_id = _agency_id
      LIMIT 20
    ), '[]')
  );
END;
$$;

-- RPC: Platform audit log with pagination
CREATE OR REPLACE FUNCTION public.get_platform_audit_log(
  _page int DEFAULT 0, _page_size int DEFAULT 50,
  _action_filter text DEFAULT NULL, _target_type_filter text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _total int; _rows jsonb;
BEGIN
  IF NOT is_platform_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT count(*) INTO _total
  FROM platform_audit_log
  WHERE (_action_filter IS NULL OR action = _action_filter)
    AND (_target_type_filter IS NULL OR target_type = _target_type_filter);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', pal.id, 'actor_id', pal.actor_id,
    'actor_name', COALESCE(p.first_name || ' ' || p.last_name, p.email, 'System'),
    'action', pal.action, 'target_type', pal.target_type,
    'target_id', pal.target_id, 'details', pal.details,
    'created_at', pal.created_at
  ) ORDER BY pal.created_at DESC), '[]') INTO _rows
  FROM (
    SELECT * FROM platform_audit_log
    WHERE (_action_filter IS NULL OR action = _action_filter)
      AND (_target_type_filter IS NULL OR target_type = _target_type_filter)
    ORDER BY created_at DESC
    LIMIT _page_size OFFSET _page * _page_size
  ) pal
  LEFT JOIN profiles p ON p.id = pal.actor_id;

  RETURN jsonb_build_object('data', _rows, 'total_count', _total);
END;
$$;
