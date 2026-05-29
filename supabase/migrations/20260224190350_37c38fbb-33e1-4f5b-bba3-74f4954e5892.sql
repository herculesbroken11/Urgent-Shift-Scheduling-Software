
-- Billing rates (bundles) per customer
CREATE TABLE public.billing_rates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_id UUID NOT NULL REFERENCES public.agencies(id),
  customer_id UUID REFERENCES public.customers(id),
  name TEXT NOT NULL,
  hourly_rate NUMERIC(10,2) NOT NULL DEFAULT 0,
  minimum_hours NUMERIC(4,2) NOT NULL DEFAULT 1,
  travel_rate_per_mile NUMERIC(10,2) NOT NULL DEFAULT 0,
  overtime_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.5,
  overtime_after_hours NUMERIC(4,2) NOT NULL DEFAULT 8,
  cancellation_window_hours INTEGER NOT NULL DEFAULT 24,
  cancellation_fee_percent NUMERIC(5,2) NOT NULL DEFAULT 100,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.billing_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage billing rates"
  ON public.billing_rates FOR ALL
  USING (agency_id = get_user_agency_id(auth.uid()) AND has_role(auth.uid(), 'agency_admin'::app_role));

CREATE POLICY "Agency members can view billing rates"
  ON public.billing_rates FOR SELECT
  USING (agency_id = get_user_agency_id(auth.uid()));

CREATE TRIGGER update_billing_rates_updated_at
  BEFORE UPDATE ON public.billing_rates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Invoices
CREATE TABLE public.invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_id UUID NOT NULL REFERENCES public.agencies(id),
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  invoice_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  issued_date DATE,
  due_date DATE,
  subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage invoices"
  ON public.invoices FOR ALL
  USING (agency_id = get_user_agency_id(auth.uid()) AND has_role(auth.uid(), 'agency_admin'::app_role));

CREATE POLICY "Agency members can view invoices"
  ON public.invoices FOR SELECT
  USING (agency_id = get_user_agency_id(auth.uid()));

CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Invoice line items
CREATE TABLE public.invoice_line_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES public.appointments(id),
  description TEXT NOT NULL,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  line_type TEXT NOT NULL DEFAULT 'service',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.invoice_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage invoice line items"
  ON public.invoice_line_items FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_line_items.invoice_id
    AND i.agency_id = get_user_agency_id(auth.uid())
    AND has_role(auth.uid(), 'agency_admin'::app_role)
  ));

CREATE POLICY "Agency members can view invoice line items"
  ON public.invoice_line_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_line_items.invoice_id
    AND i.agency_id = get_user_agency_id(auth.uid())
  ));
