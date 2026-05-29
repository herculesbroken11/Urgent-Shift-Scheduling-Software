
-- Clean up prior test load data for CODASPLUSTESTAGENCY2 only
-- Agency ID: f3eba7b6-3e4d-4e84-a7d1-a84d72ab7bff

DO $$
DECLARE
  _agency_id uuid := 'f3eba7b6-3e4d-4e84-a7d1-a84d72ab7bff';
  _admin_id uuid := '5a12f65f-dcbf-4b55-8cc6-28fe635c69c8';
BEGIN
  DELETE FROM appointment_history WHERE agency_id = _agency_id;
  DELETE FROM appointments WHERE agency_id = _agency_id;
  DELETE FROM customer_requestors WHERE agency_id = _agency_id;
  DELETE FROM interpreter_languages WHERE interpreter_id IN (
    SELECT id FROM profiles WHERE agency_id = _agency_id AND id != _admin_id
  );
  DELETE FROM interpreter_availability WHERE agency_id = _agency_id;
  DELETE FROM interpreter_notes WHERE agency_id = _agency_id;
  DELETE FROM interpreter_regions WHERE interpreter_id IN (
    SELECT id FROM profiles WHERE agency_id = _agency_id AND id != _admin_id
  );
  DELETE FROM user_roles WHERE agency_id = _agency_id AND user_id != _admin_id;
  UPDATE profiles SET is_deleted = true, deleted_at = now() 
  WHERE agency_id = _agency_id AND id != _admin_id;
  DELETE FROM locations WHERE agency_id = _agency_id;
  DELETE FROM customers WHERE agency_id = _agency_id;
  DELETE FROM billing_rates WHERE agency_id = _agency_id;
  DELETE FROM import_batch_rows WHERE batch_id IN (
    SELECT id FROM import_batches WHERE agency_id = _agency_id
  );
  DELETE FROM import_batches WHERE agency_id = _agency_id;
  DELETE FROM import_mapping_rules WHERE agency_id = _agency_id;
  DELETE FROM notification_log WHERE agency_id = _agency_id;
  
  RAISE NOTICE 'Cleanup complete for agency %', _agency_id;
END;
$$;
