
-- ============================================================
-- Migration: Import system safeguards — columns on existing tables
-- ============================================================

-- 1. Source tracking + staging + soft-delete on 4 importable tables

-- CUSTOMERS
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS source_system text,
  ADD COLUMN IF NOT EXISTS source_record_id text,
  ADD COLUMN IF NOT EXISTS last_imported_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_hash text,
  ADD COLUMN IF NOT EXISTS import_batch_id uuid,
  ADD COLUMN IF NOT EXISTS is_import_staged boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid;

-- LOCATIONS
ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS source_system text,
  ADD COLUMN IF NOT EXISTS source_record_id text,
  ADD COLUMN IF NOT EXISTS last_imported_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_hash text,
  ADD COLUMN IF NOT EXISTS import_batch_id uuid,
  ADD COLUMN IF NOT EXISTS is_import_staged boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS raw_address text,
  ADD COLUMN IF NOT EXISTS address_parse_warnings text;

ALTER TABLE public.locations ALTER COLUMN customer_id DROP NOT NULL;

-- PROFILES
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS source_system text,
  ADD COLUMN IF NOT EXISTS source_record_id text,
  ADD COLUMN IF NOT EXISTS last_imported_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_hash text,
  ADD COLUMN IF NOT EXISTS import_batch_id uuid,
  ADD COLUMN IF NOT EXISTS is_import_staged boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid;

-- APPOINTMENTS
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS source_system text,
  ADD COLUMN IF NOT EXISTS source_record_id text,
  ADD COLUMN IF NOT EXISTS last_imported_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_hash text,
  ADD COLUMN IF NOT EXISTS import_batch_id uuid,
  ADD COLUMN IF NOT EXISTS is_import_staged boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS patient_client_name text,
  ADD COLUMN IF NOT EXISTS client_reference text;

-- 2. Unique indexes for idempotent re-import
CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_source ON public.customers(agency_id, source_system, source_record_id) WHERE source_record_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_locations_source ON public.locations(agency_id, source_system, source_record_id) WHERE source_record_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_source ON public.profiles(agency_id, source_system, source_record_id) WHERE source_record_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_appointments_source ON public.appointments(agency_id, source_system, source_record_id) WHERE source_record_id IS NOT NULL;

-- 3. Indexes for staging-safe queries
CREATE INDEX IF NOT EXISTS idx_customers_live ON public.customers(agency_id) WHERE is_import_staged = false AND is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_locations_live ON public.locations(agency_id) WHERE is_import_staged = false AND is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_profiles_live ON public.profiles(agency_id) WHERE is_import_staged = false AND is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_appointments_live ON public.appointments(agency_id) WHERE is_import_staged = false AND is_deleted = false;
