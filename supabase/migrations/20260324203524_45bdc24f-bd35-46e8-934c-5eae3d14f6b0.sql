
-- Add config traceability to platform_invoices
ALTER TABLE public.platform_invoices
  ADD COLUMN IF NOT EXISTS config_id uuid REFERENCES public.platform_billing_config(id),
  ADD COLUMN IF NOT EXISTS config_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS generation_details jsonb;

-- Add config_id to platform_invoice_line_items for per-line traceability
ALTER TABLE public.platform_invoice_line_items
  ADD COLUMN IF NOT EXISTS config_id uuid REFERENCES public.platform_billing_config(id);
