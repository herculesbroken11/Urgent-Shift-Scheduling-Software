-- CP7 Remediation: Server-side interpreter assignment with conflict checking
-- MIG-CP7-01: assign_interpreter_with_conflict_check
-- MIG-CP7-02: check_interpreter_schedule_conflicts (+ batch variant)
--
-- OPERATOR PRE-FLIGHT (run separately before this migration if unsure):
--   Verify assignment_method enum includes: manual, self_claim, admin_confirmed
--   SELECT unnest(enum_range(NULL::public.assignment_method)) AS assignment_method_value;
-- If any value is missing, stop and apply the enum migration before continuing.
--
-- Manual SQL Editor: entire file runs in one transaction. On error, use ROLLBACK;

BEGIN;

-- ---------------------------------------------------------------------------
-- Shared conflict detection helper (internal)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._find_interpreter_schedule_conflicts(
  _agency_id uuid,
  _interpreter_id uuid,
  _scheduled_start timestamptz,
  _scheduled_end timestamptz,
  _exclude_appointment_id uuid DEFAULT NULL
)
RETURNS TABLE (
  conflicting_appointment_id uuid,
  conflicting_start timestamptz,
  conflicting_end timestamptz,
  conflicting_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.id,
    a.scheduled_start,
    a.scheduled_end,
    a.status::text
  FROM public.appointments a
  WHERE a.agency_id = _agency_id
    AND a.interpreter_id = _interpreter_id
    AND a.is_deleted = false
    AND a.is_import_staged = false
    AND a.scheduled_start IS NOT NULL
    AND a.scheduled_end IS NOT NULL
    AND (_exclude_appointment_id IS NULL OR a.id <> _exclude_appointment_id)
    AND a.status NOT IN (
      'cancelled'::appointment_status,
      'late_cancel_no_show_client'::appointment_status,
      'no_show_interpreter'::appointment_status,
      'completed'::appointment_status,
      'completed_last_minute'::appointment_status
    )
    AND a.scheduled_start < _scheduled_end
    AND a.scheduled_end > _scheduled_start;
$$;

-- ---------------------------------------------------------------------------
-- Single-window conflict check (read-only, for UI pre-validation)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_interpreter_schedule_conflicts(
  _interpreter_id uuid,
  _scheduled_start timestamptz,
  _scheduled_end timestamptz,
  _exclude_appointment_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _agency_id uuid;
  _conflicts jsonb;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  _agency_id := get_user_agency_id(_caller);
  IF _agency_id IS NULL THEN
    RAISE EXCEPTION 'No agency context';
  END IF;

  IF NOT (
    has_role(_caller, 'agency_admin'::app_role)
    OR has_role(_caller, 'scheduler'::app_role)
    OR (_caller = _interpreter_id AND has_role(_caller, 'interpreter'::app_role))
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF _scheduled_start IS NULL OR _scheduled_end IS NULL OR _scheduled_end <= _scheduled_start THEN
    RAISE EXCEPTION 'Invalid appointment time range';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _interpreter_id
      AND p.agency_id = _agency_id
      AND p.is_deleted = false
  ) THEN
    RAISE EXCEPTION 'Interpreter not found in agency';
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'appointment_id', c.conflicting_appointment_id,
      'scheduled_start', c.conflicting_start,
      'scheduled_end', c.conflicting_end,
      'status', c.conflicting_status
    )
  ), '[]'::jsonb)
  INTO _conflicts
  FROM public._find_interpreter_schedule_conflicts(
    _agency_id, _interpreter_id, _scheduled_start, _scheduled_end, _exclude_appointment_id
  ) c;

  RETURN jsonb_build_object(
    'has_conflict', jsonb_array_length(_conflicts) > 0,
    'conflicts', _conflicts
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Batch conflict check for recurring appointment creation
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_interpreter_schedule_conflicts_batch(
  _interpreter_id uuid,
  _occurrences jsonb,
  _exclude_appointment_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _agency_id uuid;
  _occ jsonb;
  _idx int := 0;
  _start timestamptz;
  _end timestamptz;
  _conflicts jsonb := '[]'::jsonb;
  _row jsonb;
  _found jsonb;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  _agency_id := get_user_agency_id(_caller);
  IF _agency_id IS NULL THEN
    RAISE EXCEPTION 'No agency context';
  END IF;

  IF NOT (
    has_role(_caller, 'agency_admin'::app_role)
    OR has_role(_caller, 'scheduler'::app_role)
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF _occurrences IS NULL OR jsonb_typeof(_occurrences) <> 'array' OR jsonb_array_length(_occurrences) = 0 THEN
    RAISE EXCEPTION 'occurrences must be a non-empty JSON array';
  END IF;

  FOR _occ IN SELECT value FROM jsonb_array_elements(_occurrences)
  LOOP
    _start := (_occ->>'start')::timestamptz;
    _end := (_occ->>'end')::timestamptz;

    IF _start IS NULL OR _end IS NULL OR _end <= _start THEN
      RAISE EXCEPTION 'Invalid occurrence at index %', _idx;
    END IF;

    SELECT public.check_interpreter_schedule_conflicts(
      _interpreter_id, _start, _end, _exclude_appointment_id
    ) INTO _found;

    IF (_found->>'has_conflict')::boolean THEN
      FOR _row IN SELECT value FROM jsonb_array_elements(_found->'conflicts')
      LOOP
        _conflicts := _conflicts || jsonb_build_array(
          _row || jsonb_build_object('occurrence_index', _idx)
        );
      END LOOP;
    END IF;

    _idx := _idx + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'has_conflict', jsonb_array_length(_conflicts) > 0,
    'conflicts', _conflicts
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Atomic assignment with conflict check and optional admin override
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_interpreter_with_conflict_check(
  _appointment_id uuid,
  _interpreter_id uuid,
  _override_reason text DEFAULT NULL,
  _mode text DEFAULT 'offer'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _agency_id uuid;
  _appt public.appointments%ROWTYPE;
  _is_self_claim boolean := false;
  _is_admin_assign boolean := false;
  _conflict record;
  _conflict_count int := 0;
  _new_status public.appointment_status;
  _new_method public.assignment_method;
  _custom_fields jsonb;
  _override_log jsonb;
  _override_entry jsonb;
  _trimmed_reason text;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  _agency_id := get_user_agency_id(_caller);
  IF _agency_id IS NULL THEN
    RAISE EXCEPTION 'No agency context';
  END IF;

  _trimmed_reason := NULLIF(btrim(COALESCE(_override_reason, '')), '');

  IF _mode = 'self_claim' THEN
    _is_self_claim := true;
  END IF;

  _is_admin_assign := has_role(_caller, 'agency_admin'::app_role)
    OR has_role(_caller, 'scheduler'::app_role);

  IF _is_self_claim THEN
    IF NOT has_role(_caller, 'interpreter'::app_role) THEN
      RAISE EXCEPTION 'Not authorized for self-claim';
    END IF;
    IF _caller <> _interpreter_id THEN
      RAISE EXCEPTION 'Self-claim interpreter must match caller';
    END IF;
    IF _trimmed_reason IS NOT NULL THEN
      RAISE EXCEPTION 'Override is not allowed for self-claim';
    END IF;
  ELSIF NOT _is_admin_assign THEN
    RAISE EXCEPTION 'Not authorized to assign interpreters';
  END IF;

  -- Lock target appointment
  SELECT * INTO _appt
  FROM public.appointments
  WHERE id = _appointment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appointment not found';
  END IF;

  IF _appt.agency_id <> _agency_id THEN
    RAISE EXCEPTION 'Appointment not in caller agency';
  END IF;

  IF _appt.is_deleted OR _appt.is_import_staged THEN
    RAISE EXCEPTION 'Appointment is not assignable';
  END IF;

  IF _appt.status IN (
    'cancelled'::appointment_status,
    'late_cancel_no_show_client'::appointment_status,
    'no_show_interpreter'::appointment_status,
    'completed'::appointment_status,
    'completed_last_minute'::appointment_status
  ) THEN
    RAISE EXCEPTION 'Cannot assign interpreter to terminal appointment';
  END IF;

  IF _appt.scheduled_start IS NULL OR _appt.scheduled_end IS NULL
     OR _appt.scheduled_end <= _appt.scheduled_start THEN
    RAISE EXCEPTION 'Appointment has invalid scheduled times';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _interpreter_id
      AND p.agency_id = _agency_id
      AND p.is_active = true
      AND p.is_deleted = false
  ) THEN
    RAISE EXCEPTION 'Interpreter not found or inactive';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _interpreter_id
      AND ur.agency_id = _agency_id
      AND ur.role = 'interpreter'::app_role
  ) THEN
    RAISE EXCEPTION 'Target user is not an interpreter';
  END IF;

  IF _is_self_claim THEN
    IF _appt.interpreter_id IS NOT NULL THEN
      RAISE EXCEPTION 'Appointment already assigned';
    END IF;
    IF COALESCE(_appt.is_self_claimable, false) = false THEN
      RAISE EXCEPTION 'Appointment is not self-claimable';
    END IF;
    IF _appt.status NOT IN (
      'requested'::appointment_status,
      'requested_last_minute'::appointment_status,
      'reassignment_needed'::appointment_status
    ) THEN
      RAISE EXCEPTION 'Appointment status does not allow self-claim';
    END IF;
  END IF;

  -- Lock overlapping appointments for this interpreter to reduce races
  PERFORM a.id
  FROM public.appointments a
  WHERE a.agency_id = _agency_id
    AND a.interpreter_id = _interpreter_id
    AND a.is_deleted = false
    AND a.is_import_staged = false
    AND a.id <> _appointment_id
    AND a.scheduled_start IS NOT NULL
    AND a.scheduled_end IS NOT NULL
    AND a.status NOT IN (
      'cancelled'::appointment_status,
      'late_cancel_no_show_client'::appointment_status,
      'no_show_interpreter'::appointment_status,
      'completed'::appointment_status,
      'completed_last_minute'::appointment_status
    )
    AND a.scheduled_start < _appt.scheduled_end
    AND a.scheduled_end > _appt.scheduled_start
  FOR UPDATE;

  SELECT count(*) INTO _conflict_count
  FROM public._find_interpreter_schedule_conflicts(
    _agency_id,
    _interpreter_id,
    _appt.scheduled_start,
    _appt.scheduled_end,
    _appointment_id
  );

  IF _conflict_count > 0 THEN
    IF _is_self_claim THEN
      RAISE EXCEPTION 'interpreter_schedule_conflict: Interpreter has an overlapping appointment'
        USING ERRCODE = 'P0001';
    END IF;
    IF _trimmed_reason IS NULL OR length(_trimmed_reason) < 3 THEN
      RAISE EXCEPTION 'interpreter_schedule_conflict: Conflict requires override reason (min 3 characters)'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Determine status and assignment method
  IF _is_self_claim THEN
    _new_status := 'interpreter_confirmed'::appointment_status;
    _new_method := 'self_claim'::assignment_method;
  ELSIF _mode = 'confirm' THEN
    _new_status := 'interpreter_confirmed'::appointment_status;
    _new_method := 'admin_confirmed'::assignment_method;
  ELSIF _appt.status = 'requested_last_minute'::appointment_status THEN
    _new_status := 'interpreter_assigned_last_minute'::appointment_status;
    _new_method := 'manual'::assignment_method;
  ELSE
    _new_status := 'interpreter_assigned'::appointment_status;
    _new_method := 'manual'::assignment_method;
  END IF;

  _custom_fields := COALESCE(_appt.custom_fields, '{}'::jsonb);

  IF _conflict_count > 0 AND _trimmed_reason IS NOT NULL THEN
    _override_log := COALESCE(_custom_fields->'override_log', '[]'::jsonb);
    IF jsonb_typeof(_override_log) <> 'array' THEN
      _override_log := '[]'::jsonb;
    END IF;

    SELECT c.conflicting_appointment_id, c.conflicting_start, c.conflicting_end
    INTO _conflict
    FROM public._find_interpreter_schedule_conflicts(
      _agency_id, _interpreter_id, _appt.scheduled_start, _appt.scheduled_end, _appointment_id
    ) c
    LIMIT 1;

    _override_entry := jsonb_build_object(
      'overridden_by', _caller,
      'overridden_at', now(),
      'reason', _trimmed_reason,
      'assigned_interpreter_id', _interpreter_id,
      'conflicting_entity_type', 'appointment',
      'conflicting_entity_id', _conflict.conflicting_appointment_id,
      'conflict_start', _conflict.conflicting_start,
      'conflict_end', _conflict.conflicting_end,
      'source', 'assign_interpreter_with_conflict_check'
    );

    _custom_fields := jsonb_set(
      _custom_fields,
      '{override_log}',
      _override_log || _override_entry,
      true
    );
  END IF;

  UPDATE public.appointments
  SET
    interpreter_id = _interpreter_id,
    status = _new_status,
    assignment_method = _new_method,
    custom_fields = _custom_fields,
    updated_at = now()
  WHERE id = _appointment_id
  RETURNING * INTO _appt;

  RETURN jsonb_build_object(
    'success', true,
    'had_conflict', _conflict_count > 0,
    'appointment', to_jsonb(_appt)
  );
END;
$$;

REVOKE ALL ON FUNCTION public._find_interpreter_schedule_conflicts(uuid, uuid, timestamptz, timestamptz, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_interpreter_schedule_conflicts(uuid, timestamptz, timestamptz, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_interpreter_schedule_conflicts_batch(uuid, jsonb, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assign_interpreter_with_conflict_check(uuid, uuid, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.check_interpreter_schedule_conflicts(uuid, timestamptz, timestamptz, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_interpreter_schedule_conflicts_batch(uuid, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_interpreter_with_conflict_check(uuid, uuid, text, text) TO authenticated;

COMMIT;
