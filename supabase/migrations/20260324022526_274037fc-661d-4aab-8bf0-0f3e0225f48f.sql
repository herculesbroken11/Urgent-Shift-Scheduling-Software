
-- Sync jobs table for tracking bulk sync progress
CREATE TABLE public.qbo_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id),
  status text NOT NULL DEFAULT 'pending',
  date_from timestamptz,
  date_to timestamptz,
  total_records integer NOT NULL DEFAULT 0,
  processed_records integer NOT NULL DEFAULT 0,
  synced_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  batch_size integer NOT NULL DEFAULT 200,
  cursor_position text,
  errors jsonb DEFAULT '[]'::jsonb,
  mapping_warnings jsonb DEFAULT '[]'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.qbo_sync_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage sync jobs"
  ON public.qbo_sync_jobs
  FOR ALL
  TO authenticated
  USING (agency_id = get_user_agency_id(auth.uid()) AND has_role(auth.uid(), 'agency_admin'::app_role))
  WITH CHECK (agency_id = get_user_agency_id(auth.uid()) AND has_role(auth.uid(), 'agency_admin'::app_role));
