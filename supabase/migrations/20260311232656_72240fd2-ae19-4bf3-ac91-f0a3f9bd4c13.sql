-- Drop the duplicate audit trigger; keep only trg_appointment_audit
DROP TRIGGER IF EXISTS trg_log_appointment_change ON public.appointments;