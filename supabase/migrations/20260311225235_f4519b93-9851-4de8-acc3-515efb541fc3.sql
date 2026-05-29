
-- Create the missing audit trigger on appointments table.
-- This was never attached despite the function existing.
CREATE TRIGGER trg_log_appointment_change
  AFTER INSERT OR UPDATE OR DELETE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.log_appointment_change();
