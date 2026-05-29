-- Create the audit trigger on appointments table
CREATE OR REPLACE TRIGGER trg_log_appointment_change
  AFTER INSERT OR UPDATE OR DELETE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.log_appointment_change();