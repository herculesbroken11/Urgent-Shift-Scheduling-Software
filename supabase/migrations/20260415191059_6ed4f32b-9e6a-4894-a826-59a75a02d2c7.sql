
-- =============================================
-- MIGRATION 2: Enum swap, data migration, recreate dependencies
-- =============================================

-- 0. Drop partial index that references old enum values
DROP INDEX IF EXISTS public.idx_appointments_reminder_window;

-- 1. Create new enum
CREATE TYPE public.appointment_status_v3 AS ENUM (
  'requested',
  'requested_last_minute',
  'interpreter_assigned',
  'interpreter_assigned_last_minute',
  'interpreter_confirmed',
  'reassignment_needed',
  'in_progress',
  'completed',
  'completed_last_minute',
  'cancelled',
  'late_cancel_no_show_client',
  'no_show_interpreter'
);

-- 2. Convert status column to text
ALTER TABLE public.appointments ALTER COLUMN status DROP DEFAULT;
ALTER TABLE public.appointments ALTER COLUMN status TYPE text USING status::text;

-- 3. Map old statuses to new
UPDATE public.appointments SET status = 'requested' WHERE status = 'pending' AND interpreter_id IS NULL;
UPDATE public.appointments SET status = 'interpreter_assigned' WHERE status = 'pending' AND interpreter_id IS NOT NULL;
UPDATE public.appointments SET status = 'requested' WHERE status = 'scheduled' AND interpreter_id IS NULL;
UPDATE public.appointments SET status = 'interpreter_assigned' WHERE status = 'scheduled' AND interpreter_id IS NOT NULL;
UPDATE public.appointments SET status = 'interpreter_assigned' WHERE status = 'offered';
UPDATE public.appointments SET status = 'interpreter_confirmed' WHERE status = 'confirmed';
UPDATE public.appointments SET status = 'late_cancel_no_show_client' WHERE status = 'no_show';
UPDATE public.appointments SET status = 'completed' WHERE status IN ('validated', 'billed', 'pending_verification');
UPDATE public.appointments SET status = 'requested' WHERE status = 'revision_needed';

-- 4. Convert to new enum type
ALTER TABLE public.appointments ALTER COLUMN status TYPE appointment_status_v3 USING status::appointment_status_v3;
ALTER TABLE public.appointments ALTER COLUMN status SET DEFAULT 'requested'::appointment_status_v3;

-- 5. Drop old enum, rename new
DROP TYPE public.appointment_status;
ALTER TYPE public.appointment_status_v3 RENAME TO appointment_status;

-- 6. Add admin_confirmed to assignment_method enum
ALTER TYPE public.assignment_method ADD VALUE IF NOT EXISTS 'admin_confirmed';

-- 7. Recreate appointments_live view with new columns
CREATE OR REPLACE VIEW public.appointments_live AS
SELECT id, agency_id, customer_id, location_id, requester_id, interpreter_id, language_id,
  status, assignment_method, title, description,
  scheduled_start, scheduled_end, actual_start, actual_end,
  is_self_claimable, cancellation_reason, cancelled_at, custom_fields,
  notes, requester_notes, interpreter_notes, agency_notes, interpreter_notes_history,
  late_cancel_detected_at,
  created_at, updated_at, modality,
  signature_data, signature_timestamp, signature_lat, signature_lng, parking_cost,
  parent_recurring_id, recurrence_rule,
  gcal_event_id, gcal_sync_status, gcal_last_synced_at, gcal_sync_error,
  source_system, source_record_id, last_imported_at, source_hash, import_batch_id,
  is_import_staged, is_deleted, deleted_at, deleted_by,
  category, patient_client_name, client_reference,
  qbo_invoice_id, qbo_bill_id, qbo_customer_id, qbo_vendor_id,
  qbo_sync_status, qbo_last_synced_at,
  payment_status, billed_amount, interpreter_pay_amount, billing_breakdown
FROM public.appointments
WHERE is_import_staged = false AND is_deleted = false;

-- 8. Recreate interpreter self-claim RLS policy with v3 statuses
CREATE POLICY "Interpreters can update assigned appointments"
ON public.appointments FOR UPDATE TO authenticated
USING (
  (agency_id = get_user_agency_id(auth.uid()))
  AND has_role(auth.uid(), 'interpreter'::app_role)
  AND (
    interpreter_id = auth.uid()
    OR (interpreter_id IS NULL AND is_self_claimable = true)
  )
)
WITH CHECK (
  (agency_id = get_user_agency_id(auth.uid()))
  AND (
    interpreter_id = auth.uid()
    OR (interpreter_id IS NULL AND status IN ('requested'::appointment_status, 'requested_last_minute'::appointment_status, 'reassignment_needed'::appointment_status))
  )
);

-- 9. Recreate triggers
CREATE TRIGGER trg_appointment_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.log_appointment_change();

CREATE TRIGGER trg_platform_usage
  AFTER UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.record_platform_usage();

-- 10. Recreate the partial index with new status values
CREATE INDEX idx_appointments_reminder_window
  ON public.appointments (scheduled_start, status)
  WHERE interpreter_id IS NOT NULL
    AND status IN ('interpreter_assigned'::appointment_status, 'interpreter_assigned_last_minute'::appointment_status, 'interpreter_confirmed'::appointment_status);

-- 11. Copy notes data into three-tier notes (preserve original notes column)
UPDATE public.appointments
SET requester_notes = notes
WHERE notes IS NOT NULL AND notes != '' AND requester_id IS NOT NULL;

UPDATE public.appointments
SET agency_notes = notes
WHERE notes IS NOT NULL AND notes != '' AND requester_id IS NULL;
