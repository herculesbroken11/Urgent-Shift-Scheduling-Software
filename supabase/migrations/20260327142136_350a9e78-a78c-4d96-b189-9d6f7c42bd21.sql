CREATE INDEX IF NOT EXISTS idx_interpreter_availability_agency ON interpreter_availability (agency_id);
CREATE INDEX IF NOT EXISTS idx_interpreter_availability_interpreter ON interpreter_availability (interpreter_id);
CREATE INDEX IF NOT EXISTS idx_interpreter_availability_agency_interpreter ON interpreter_availability (agency_id, interpreter_id);