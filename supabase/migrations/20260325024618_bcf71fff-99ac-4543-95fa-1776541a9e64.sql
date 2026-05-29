CREATE UNIQUE INDEX IF NOT EXISTS uq_conversations_agency_appointment
ON public.conversations (agency_id, appointment_id)
WHERE appointment_id IS NOT NULL;