
CREATE TABLE public.interpreter_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id),
  interpreter_id uuid NOT NULL REFERENCES public.profiles(id),
  notes text NOT NULL DEFAULT '',
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(agency_id, interpreter_id)
);

ALTER TABLE public.interpreter_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage interpreter notes"
  ON public.interpreter_notes
  FOR ALL
  USING (agency_id = get_user_agency_id(auth.uid()) AND has_role(auth.uid(), 'agency_admin'::app_role));

CREATE TRIGGER update_interpreter_notes_updated_at
  BEFORE UPDATE ON public.interpreter_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
