-- Restore TestCorp config start date and clean up test usage data
UPDATE platform_billing_config SET effective_start_date = '2026-03-24' WHERE id = 'e7950d88-3468-47b5-a8e7-7728fd25140d';
DELETE FROM platform_usage_log WHERE agency_id = '9965cde8-c8c4-402d-8a32-3bfba13f7f9e' AND billing_month = '2026-02';