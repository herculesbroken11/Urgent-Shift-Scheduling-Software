-- Drop the simple unique constraint that blocks void+regenerate
ALTER TABLE platform_invoices DROP CONSTRAINT platform_invoices_agency_id_billing_month_key;

-- Add partial unique index: only one non-void invoice per agency+month
CREATE UNIQUE INDEX platform_invoices_agency_billing_month_active_idx
  ON platform_invoices (agency_id, billing_month)
  WHERE status != 'void';