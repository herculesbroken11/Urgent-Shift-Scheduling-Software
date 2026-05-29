
-- Batch lifecycle transition function
CREATE OR REPLACE FUNCTION public.transition_import_batch(
  _batch_id uuid,
  _new_status text,
  _user_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _current text;
  _valid_transitions jsonb := '{
    "pending": ["validating"],
    "validating": ["ready", "failed"],
    "ready": ["processing"],
    "processing": ["completed", "failed"],
    "completed": ["rolling_back"],
    "rolling_back": ["rolled_back", "failed"]
  }'::jsonb;
  _allowed jsonb;
BEGIN
  SELECT status INTO _current FROM import_batches WHERE id = _batch_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Batch % not found', _batch_id;
  END IF;

  _allowed := _valid_transitions -> _current;
  IF _allowed IS NULL OR NOT (_allowed ? _new_status) THEN
    RAISE EXCEPTION 'Invalid transition from % to %', _current, _new_status;
  END IF;

  UPDATE import_batches
  SET status = _new_status,
      updated_at = now(),
      completed_at = CASE WHEN _new_status IN ('completed', 'failed', 'rolled_back') THEN now() ELSE completed_at END,
      rolled_back_at = CASE WHEN _new_status = 'rolled_back' THEN now() ELSE rolled_back_at END,
      rolled_back_by = CASE WHEN _new_status = 'rolled_back' THEN _user_id ELSE rolled_back_by END
  WHERE id = _batch_id;
END;
$$;

-- Rollback import batch function
CREATE OR REPLACE FUNCTION public.rollback_import_batch(_batch_id uuid, _user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _batch record;
  _dep_check jsonb;
  _created_count int := 0;
  _restored_count int := 0;
  _row record;
BEGIN
  SELECT * INTO _batch FROM import_batches WHERE id = _batch_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Batch not found';
  END IF;

  IF _batch.status != 'completed' THEN
    RAISE EXCEPTION 'Only completed batches can be rolled back (current: %)', _batch.status;
  END IF;

  IF _batch.is_rollbackable = false THEN
    RAISE EXCEPTION 'This batch is not rollbackable';
  END IF;

  -- Check dependencies
  _dep_check := check_rollback_dependencies(_batch_id);
  IF NOT (_dep_check->>'can_rollback')::boolean THEN
    RETURN _dep_check;
  END IF;

  -- Transition to rolling_back
  PERFORM transition_import_batch(_batch_id, 'rolling_back', _user_id);

  -- Process created records: soft-delete them
  FOR _row IN
    SELECT * FROM import_batch_rows
    WHERE batch_id = _batch_id AND action_taken = 'created' AND target_record_id IS NOT NULL
  LOOP
    -- Determine entity type from batch
    CASE _batch.entity_type
      WHEN 'appointments' THEN
        UPDATE appointments SET is_deleted = true, deleted_at = now(), deleted_by = _user_id WHERE id = _row.target_record_id;
      WHEN 'customers' THEN
        UPDATE customers SET is_deleted = true, deleted_at = now(), deleted_by = _user_id WHERE id = _row.target_record_id;
      WHEN 'locations' THEN
        UPDATE locations SET is_deleted = true, deleted_at = now(), deleted_by = _user_id WHERE id = _row.target_record_id;
      WHEN 'interpreters' THEN
        UPDATE profiles SET is_deleted = true, deleted_at = now(), deleted_by = _user_id WHERE id = _row.target_record_id;
      ELSE NULL;
    END CASE;
    _created_count := _created_count + 1;
  END LOOP;

  -- Process updated records: restore previous_data
  FOR _row IN
    SELECT * FROM import_batch_rows
    WHERE batch_id = _batch_id AND action_taken = 'updated' AND target_record_id IS NOT NULL AND previous_data IS NOT NULL
  LOOP
    CASE _batch.entity_type
      WHEN 'appointments' THEN
        UPDATE appointments SET
          title = COALESCE((_row.previous_data->>'title'), title),
          status = COALESCE((_row.previous_data->>'status')::appointment_status, status),
          scheduled_start = COALESCE((_row.previous_data->>'scheduled_start')::timestamptz, scheduled_start),
          scheduled_end = COALESCE((_row.previous_data->>'scheduled_end')::timestamptz, scheduled_end),
          customer_id = COALESCE((_row.previous_data->>'customer_id')::uuid, customer_id),
          location_id = COALESCE((_row.previous_data->>'location_id')::uuid, location_id),
          interpreter_id = (_row.previous_data->>'interpreter_id')::uuid,
          language_id = COALESCE((_row.previous_data->>'language_id')::uuid, language_id),
          notes = _row.previous_data->>'notes',
          category = _row.previous_data->>'category',
          patient_client_name = _row.previous_data->>'patient_client_name',
          updated_at = now()
        WHERE id = _row.target_record_id;
      WHEN 'customers' THEN
        UPDATE customers SET
          name = COALESCE((_row.previous_data->>'name'), name),
          contact_name = _row.previous_data->>'contact_name',
          contact_email = _row.previous_data->>'contact_email',
          contact_phone = _row.previous_data->>'contact_phone',
          billing_email = _row.previous_data->>'billing_email',
          updated_at = now()
        WHERE id = _row.target_record_id;
      WHEN 'locations' THEN
        UPDATE locations SET
          name = COALESCE((_row.previous_data->>'name'), name),
          address_line1 = _row.previous_data->>'address_line1',
          city = _row.previous_data->>'city',
          state = _row.previous_data->>'state',
          zip_code = _row.previous_data->>'zip_code',
          raw_address = _row.previous_data->>'raw_address'
        WHERE id = _row.target_record_id;
      WHEN 'interpreters' THEN
        UPDATE profiles SET
          first_name = _row.previous_data->>'first_name',
          last_name = _row.previous_data->>'last_name',
          email = _row.previous_data->>'email',
          phone = _row.previous_data->>'phone',
          updated_at = now()
        WHERE id = _row.target_record_id;
      ELSE NULL;
    END CASE;
    _restored_count := _restored_count + 1;
  END LOOP;

  -- Transition to rolled_back
  PERFORM transition_import_batch(_batch_id, 'rolled_back', _user_id);

  RETURN jsonb_build_object(
    'success', true,
    'created_reverted', _created_count,
    'updated_restored', _restored_count
  );
END;
$$;

-- Concurrency check: prevent duplicate active imports
CREATE OR REPLACE FUNCTION public.check_import_concurrency(
  _agency_id uuid,
  _entity_type text,
  _source_system text DEFAULT 'codas_plus'
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM import_batches
    WHERE agency_id = _agency_id
      AND entity_type = _entity_type
      AND source_system = _source_system
      AND status IN ('pending', 'validating', 'ready', 'processing')
  );
$$;
