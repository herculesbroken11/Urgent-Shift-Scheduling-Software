
ALTER TABLE public.platform_billing_config
  ADD COLUMN IF NOT EXISTS plan_name text DEFAULT '',
  ADD COLUMN IF NOT EXISTS setup_fee numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_monthly_fee numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_monthly_fee numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes text DEFAULT '',
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
