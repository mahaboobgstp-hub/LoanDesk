
-- LOANDESK: AGENT SELF-REGISTRATION AND APPROVAL
-- Run once in the existing LoanDesk Supabase project.

-- 1. Extend agent profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS mobile text,
ADD COLUMN IF NOT EXISTS city text,
ADD COLUMN IF NOT EXISTS state text,
ADD COLUMN IF NOT EXISTS agent_code text;

CREATE UNIQUE INDEX IF NOT EXISTS
idx_profiles_agent_code
ON public.profiles(agent_code)
WHERE agent_code IS NOT NULL;

-- 2. Registration queue
CREATE TABLE IF NOT EXISTS public.agent_registrations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name text NOT NULL,
    email text NOT NULL,
    mobile text NOT NULL,
    city text NOT NULL,
    state text NOT NULL,
    status text NOT NULL DEFAULT 'pending'
        CHECK (status IN (
            'pending',
            'approved',
            'rejected'
        )),
    reviewed_by uuid REFERENCES public.profiles(id),
    reviewed_at timestamptz,
    rejection_reason text,
    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT agent_registrations_email_unique
        UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS
idx_agent_registrations_status_date
ON public.agent_registrations(status, created_at DESC);

-- 3. RLS
ALTER TABLE public.agent_registrations
ENABLE ROW LEVEL SECURITY;

-- Public users can submit registration applications.
DROP POLICY IF EXISTS
"public submit agent registration"
ON public.agent_registrations;

CREATE POLICY "public submit agent registration"
ON public.agent_registrations
FOR INSERT
TO anon, authenticated
WITH CHECK (
    status = 'pending'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
    AND rejection_reason IS NULL
);

-- Only administrators can view registrations.
DROP POLICY IF EXISTS
"admin view agent registrations"
ON public.agent_registrations;

CREATE POLICY "admin view agent registrations"
ON public.agent_registrations
FOR SELECT
TO authenticated
USING (private.is_admin());

-- Only administrators can update registrations.
DROP POLICY IF EXISTS
"admin update agent registrations"
ON public.agent_registrations;

CREATE POLICY "admin update agent registrations"
ON public.agent_registrations
FOR UPDATE
TO authenticated
USING (private.is_admin())
WITH CHECK (private.is_admin());

-- 4. Permissions
GRANT INSERT ON public.agent_registrations
TO anon, authenticated;

GRANT SELECT, UPDATE ON public.agent_registrations
TO authenticated;

GRANT SELECT, UPDATE ON public.profiles
TO authenticated;

-- 5. Do not grant public access to profiles.
-- Existing profile RLS policies remain in force.
