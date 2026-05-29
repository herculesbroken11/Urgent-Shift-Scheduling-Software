
-- Platform-level QBO connection (single row for BlueThread's own QuickBooks)
CREATE TABLE public.platform_qbo_connection (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  realm_id text,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  company_name text,
  connection_status text NOT NULL DEFAULT 'disconnected',
  last_sync_at timestamptz,
  connected_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add QBO customer ID to agencies table for mapping agencies as QBO customers in BlueThread's books
ALTER TABLE public.agencies ADD COLUMN platform_qbo_customer_id text;

-- Platform invoices (BlueThread invoicing agencies)
CREATE TABLE public.platform_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id),
  invoice_number text NOT NULL,
  billing_month text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  subtotal numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  issued_date date,
  due_date date,
  notes text,
  qbo_invoice_id text,
  qbo_sync_token text,
  qbo_last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(agency_id, billing_month)
);

-- Platform invoice line items
CREATE TABLE public.platform_invoice_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.platform_invoices(id) ON DELETE CASCADE,
  line_type text NOT NULL,
  description text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Platform QBO sync log
CREATE TABLE public.platform_qbo_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id text,
  action text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  qbo_entity_id text,
  error_details text,
  synced_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.platform_qbo_connection ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_invoice_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_qbo_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform owners can manage platform QBO connection"
  ON public.platform_qbo_connection FOR ALL TO authenticated
  USING (public.is_platform_owner(auth.uid()))
  WITH CHECK (public.is_platform_owner(auth.uid()));

CREATE POLICY "Platform owners can manage platform invoices"
  ON public.platform_invoices FOR ALL TO authenticated
  USING (public.is_platform_owner(auth.uid()))
  WITH CHECK (public.is_platform_owner(auth.uid()));

CREATE POLICY "Platform owners can manage platform invoice line items"
  ON public.platform_invoice_line_items FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.platform_invoices pi
    WHERE pi.id = invoice_id AND public.is_platform_owner(auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.platform_invoices pi
    WHERE pi.id = invoice_id AND public.is_platform_owner(auth.uid())
  ));

CREATE POLICY "Platform owners can manage platform QBO sync log"
  ON public.platform_qbo_sync_log FOR ALL TO authenticated
  USING (public.is_platform_owner(auth.uid()))
  WITH CHECK (public.is_platform_owner(auth.uid()));

CREATE TRIGGER update_platform_qbo_connection_updated_at
  BEFORE UPDATE ON public.platform_qbo_connection
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_platform_invoices_updated_at
  BEFORE UPDATE ON public.platform_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
