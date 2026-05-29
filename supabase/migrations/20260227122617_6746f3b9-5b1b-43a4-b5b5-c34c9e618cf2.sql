
-- Add missing appointment statuses to the enum
ALTER TYPE public.appointment_status ADD VALUE IF NOT EXISTS 'offered';
ALTER TYPE public.appointment_status ADD VALUE IF NOT EXISTS 'validated';
ALTER TYPE public.appointment_status ADD VALUE IF NOT EXISTS 'billed';
