
-- Temporarily disable audit trigger to allow bulk delete
ALTER TABLE appointments DISABLE TRIGGER trg_appointment_audit;
ALTER TABLE appointments DISABLE TRIGGER trg_platform_usage;

-- Delete appointments for test agency
DELETE FROM appointments WHERE agency_id = 'f3eba7b6-3e4d-4e84-a7d1-a84d72ab7bff';

-- Re-enable triggers
ALTER TABLE appointments ENABLE TRIGGER trg_appointment_audit;
ALTER TABLE appointments ENABLE TRIGGER trg_platform_usage;

-- Delete locations
DELETE FROM locations WHERE agency_id = 'f3eba7b6-3e4d-4e84-a7d1-a84d72ab7bff';

-- Delete customers
DELETE FROM customers WHERE agency_id = 'f3eba7b6-3e4d-4e84-a7d1-a84d72ab7bff';

-- Delete billing rates
DELETE FROM billing_rates WHERE agency_id = 'f3eba7b6-3e4d-4e84-a7d1-a84d72ab7bff';

-- Delete import batches
DELETE FROM import_batches WHERE agency_id = 'f3eba7b6-3e4d-4e84-a7d1-a84d72ab7bff';

-- Delete interpreter languages for test users
DELETE FROM interpreter_languages WHERE interpreter_id IN (
  SELECT id FROM profiles WHERE agency_id = 'f3eba7b6-3e4d-4e84-a7d1-a84d72ab7bff' AND id != '5a12f65f-dcbf-4b55-8cc6-28fe635c69c8'
);

-- Delete interpreter regions for test users  
DELETE FROM interpreter_regions WHERE interpreter_id IN (
  SELECT id FROM profiles WHERE agency_id = 'f3eba7b6-3e4d-4e84-a7d1-a84d72ab7bff' AND id != '5a12f65f-dcbf-4b55-8cc6-28fe635c69c8'
);

-- Delete user roles for non-admin test users
DELETE FROM user_roles WHERE agency_id = 'f3eba7b6-3e4d-4e84-a7d1-a84d72ab7bff' AND user_id != '5a12f65f-dcbf-4b55-8cc6-28fe635c69c8';

-- Detach non-admin profiles from this agency
UPDATE profiles SET agency_id = NULL, is_active = false WHERE agency_id = 'f3eba7b6-3e4d-4e84-a7d1-a84d72ab7bff' AND id != '5a12f65f-dcbf-4b55-8cc6-28fe635c69c8';

-- Delete platform usage log for test agency
DELETE FROM platform_usage_log WHERE agency_id = 'f3eba7b6-3e4d-4e84-a7d1-a84d72ab7bff';

-- Delete notification log for test agency
DELETE FROM notification_log WHERE agency_id = 'f3eba7b6-3e4d-4e84-a7d1-a84d72ab7bff';
