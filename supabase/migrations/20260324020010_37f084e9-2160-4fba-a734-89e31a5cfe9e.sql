
-- QBO connections table (per-agency OAuth connection)
CREATE TABLE public.qbo_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  realm_id text,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  company_name text,
  sync_enabled boolean NOT NULL DEFAULT false,
  integration_mode text NOT NULL DEFAULT 'csv_only' CHECK (integration_mode IN ('csv_only', 'direct_sync', 'both')),
  connection_status text NOT NULL DEFAULT 'disconnected' CHECK (connection_status IN ('connected', 'disconnected', 'expired', 'error')),
  auto_sync_on_completed boolean NOT NULL DEFAULT false,
  auto_sync_on_validated boolean NOT NULL DEFAULT false,
  require_manual_approval boolean NOT NULL DEFAULT true,
  default_customer_naming text NOT NULL DEFAULT '{customer_name}',
  default_vendor_naming text NOT NULL DEFAULT '{first_name} {last_name}',
  last_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(agency_id)
);

ALTER TABLE public.qbo_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage QBO connections"
  ON public.qbo_connections FOR ALL TO authenticated
  USING (agency_id = get_user_agency_id(auth.uid()) AND has_role(auth.uid(), 'agency_admin'::app_role))
  WITH CHECK (agency_id = get_user_agency_id(auth.uid()) AND has_role(auth.uid(), 'agency_admin'::app_role));

-- QBO item mappings (map our line item types to QBO service items and accounts)
CREATE TABLE public.qbo_item_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  line_item_type text NOT NULL,
  qbo_service_item_name text,
  qbo_service_item_id text,
  qbo_income_account_name text,
  qbo_income_account_id text,
  qbo_expense_account_name text,
  qbo_expense_account_id text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(agency_id, line_item_type)
);

ALTER TABLE public.qbo_item_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage QBO item mappings"
  ON public.qbo_item_mappings FOR ALL TO authenticated
  USING (agency_id = get_user_agency_id(auth.uid()) AND has_role(auth.uid(), 'agency_admin'::app_role))
  WITH CHECK (agency_id = get_user_agency_id(auth.uid()) AND has_role(auth.uid(), 'agency_admin'::app_role));

-- QBO sync log
CREATE TABLE public.qbo_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.appointments(id),
  entity_type text NOT NULL,
  qbo_object_type text NOT NULL,
  action text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'retrying')),
  error_details text,
  qbo_invoice_id text,
  qbo_bill_id text,
  qbo_customer_id text,
  qbo_vendor_id text,
  retry_count integer NOT NULL DEFAULT 0,
  max_retries integer NOT NULL DEFAULT 3,
  next_retry_at timestamptz,
  request_payload jsonb,
  response_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE public.qbo_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view QBO sync log"
  ON public.qbo_sync_log FOR ALL TO authenticated
  USING (agency_id = get_user_agency_id(auth.uid()) AND has_role(auth.uid(), 'agency_admin'::app_role));

-- QBO webhook events log
CREATE TABLE public.qbo_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid REFERENCES public.agencies(id),
  realm_id text NOT NULL,
  event_type text NOT NULL,
  entity_type text,
  entity_id text,
  payload jsonb NOT NULL,
  processed boolean NOT NULL DEFAULT false,
  processed_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.qbo_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view QBO webhook events"
  ON public.qbo_webhook_events FOR ALL TO authenticated
  USING (agency_id = get_user_agency_id(auth.uid()) AND has_role(auth.uid(), 'agency_admin'::app_role));

-- Add QBO tracking fields to appointments
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS qbo_invoice_id text,
  ADD COLUMN IF NOT EXISTS qbo_bill_id text,
  ADD COLUMN IF NOT EXISTS qbo_customer_id text,
  ADD COLUMN IF NOT EXISTS qbo_vendor_id text,
  ADD COLUMN IF NOT EXISTS qbo_sync_status text DEFAULT 'unsynced' CHECK (qbo_sync_status IN ('unsynced', 'pending', 'synced', 'error', 'skipped')),
  ADD COLUMN IF NOT EXISTS qbo_last_synced_at timestamptz;
