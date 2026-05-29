
-- Add expires_at to invitations
ALTER TABLE public.invitations
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days');

-- Add setup_link to store the recovery/invite link
ALTER TABLE public.invitations
  ADD COLUMN IF NOT EXISTS setup_link text;
