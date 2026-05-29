-- Fix: Change appointment_history FK to SET NULL on delete so deleting
-- appointments doesn't fail due to audit log references.
-- This preserves the audit trail (with null appointment_id) while allowing deletes.

ALTER TABLE public.appointment_history
  DROP CONSTRAINT appointment_history_appointment_id_fkey;

ALTER TABLE public.appointment_history
  ADD CONSTRAINT appointment_history_appointment_id_fkey
    FOREIGN KEY (appointment_id)
    REFERENCES public.appointments(id)
    ON DELETE SET NULL;

-- Also make appointment_id nullable (it currently is NOT NULL)
ALTER TABLE public.appointment_history
  ALTER COLUMN appointment_id DROP NOT NULL;