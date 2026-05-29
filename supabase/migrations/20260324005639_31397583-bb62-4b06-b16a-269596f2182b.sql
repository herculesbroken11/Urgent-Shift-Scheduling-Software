
-- ============================================================
-- Migration: Import infrastructure tables
-- ============================================================

-- import_batches: tracks each import job
CREATE TABLE public.import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id),
  source_system text NOT NULL DEFAULT 'codas_plus',
  entity_type text NOT NULL,
  uploaded_filename text NOT NULL,
  uploaded_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  is_staged boolean NOT NULL DEFAULT false,
  dry_run_summary jsonb DEFAULT '{}',
  mapping_decisions jsonb DEFAULT '[]',
  execution_summary jsonb DEFAULT '{}',
  reconciliation_report_url text,
  error_log jsonb DEFAULT '[]',
  quality_score numeric,
  quality_details jsonb DEFAULT '{}',
  total_rows int,
  processed_rows int DEFAULT 0,
  current_chunk int DEFAULT 0,
  total_chunks int DEFAULT 0,
  is_rollbackable boolean NOT NULL DEFAULT true,
  rolled_back_at timestamptz,
  rolled_back_by uuid,
  protected_fields jsonb DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage import batches" ON public.import_batches FOR ALL
  TO authenticated
  USING (agency_id = public.get_user_agency_id(auth.uid()) AND public.has_role(auth.uid(), 'agency_admin'));

-- Concurrency control: only one active import per agency+entity+source
CREATE UNIQUE INDEX uq_active_import_batch
  ON public.import_batches(agency_id, entity_type, source_system)
  WHERE status IN ('pending','validating','wizard_pending','ready','staging','executing');

-- import_batch_rows: per-row tracking
CREATE TABLE public.import_batch_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.import_batches(id) ON DELETE CASCADE,
  row_number int NOT NULL,
  raw_data jsonb NOT NULL,
  transformed_data jsonb,
  status text NOT NULL DEFAULT 'pending',
  validation_messages jsonb DEFAULT '[]',
  target_record_id uuid,
  previous_data jsonb,
  action_taken text,
  conflict_type text,
  conflict_resolution text,
  conflict_resolved_by uuid,
  conflict_resolved_at timestamptz,
  chunk_number int,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.import_batch_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage batch rows" ON public.import_batch_rows FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.import_batches b
    WHERE b.id = import_batch_rows.batch_id
      AND b.agency_id = public.get_user_agency_id(auth.uid())
      AND public.has_role(auth.uid(), 'agency_admin')
  ));
CREATE INDEX idx_batch_rows_batch ON public.import_batch_rows(batch_id);
CREATE INDEX idx_batch_rows_status ON public.import_batch_rows(batch_id, status);
CREATE INDEX idx_batch_rows_conflict ON public.import_batch_rows(batch_id, conflict_type) WHERE conflict_type IS NOT NULL;

-- import_mapping_rules: reusable value mappings
CREATE TABLE public.import_mapping_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id),
  source_system text NOT NULL DEFAULT 'codas_plus',
  entity_type text NOT NULL,
  source_field text NOT NULL,
  source_value text NOT NULL,
  mapped_field text NOT NULL,
  mapped_value text NOT NULL,
  is_reusable boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(agency_id, source_system, entity_type, source_field, source_value)
);
ALTER TABLE public.import_mapping_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage mapping rules" ON public.import_mapping_rules FOR ALL
  TO authenticated
  USING (agency_id = public.get_user_agency_id(auth.uid()) AND public.has_role(auth.uid(), 'agency_admin'));

-- import_mapping_templates: pre-built mapping profiles
CREATE TABLE public.import_mapping_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  source_system text NOT NULL,
  description text,
  is_system boolean NOT NULL DEFAULT false,
  agency_id uuid REFERENCES public.agencies(id),
  rules jsonb NOT NULL DEFAULT '[]',
  field_defaults jsonb DEFAULT '{}',
  header_signatures jsonb DEFAULT '{}',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.import_mapping_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view system templates" ON public.import_mapping_templates FOR SELECT
  TO authenticated
  USING (is_system = true);
CREATE POLICY "Admins manage agency templates" ON public.import_mapping_templates FOR ALL
  TO authenticated
  USING (
    agency_id IS NOT NULL
    AND agency_id = public.get_user_agency_id(auth.uid())
    AND public.has_role(auth.uid(), 'agency_admin')
  );

-- import_quality_thresholds: per-agency configurable thresholds
CREATE TABLE public.import_quality_thresholds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id),
  min_quality_score int NOT NULL DEFAULT 70,
  max_error_percent numeric NOT NULL DEFAULT 5.0,
  max_warning_percent numeric NOT NULL DEFAULT 30.0,
  require_zero_blocking_errors boolean NOT NULL DEFAULT true,
  require_wizard_complete boolean NOT NULL DEFAULT true,
  allow_skip_staging boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(agency_id)
);
ALTER TABLE public.import_quality_thresholds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage thresholds" ON public.import_quality_thresholds FOR ALL
  TO authenticated
  USING (agency_id = public.get_user_agency_id(auth.uid()) AND public.has_role(auth.uid(), 'agency_admin'));
