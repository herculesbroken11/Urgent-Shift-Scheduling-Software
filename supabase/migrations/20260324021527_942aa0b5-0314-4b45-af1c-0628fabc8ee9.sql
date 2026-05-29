
-- Add persistent QBO entity linkage columns to customers and profiles
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS qbo_customer_id text,
  ADD COLUMN IF NOT EXISTS qbo_last_synced_at timestamptz;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS qbo_vendor_id text,
  ADD COLUMN IF NOT EXISTS qbo_last_synced_at timestamptz;

-- Add unique constraint on qbo_item_mappings for upsert support
-- (agency_id, line_item_type) should be unique
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'qbo_item_mappings_agency_line_type_unique'
  ) THEN
    ALTER TABLE public.qbo_item_mappings
      ADD CONSTRAINT qbo_item_mappings_agency_line_type_unique UNIQUE (agency_id, line_item_type);
  END IF;
END $$;

-- Add payment_status to appointments for webhook-driven payment reconciliation
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'unpaid';
