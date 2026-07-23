-- BL-01: defense-in-depth rate limiting for the PUBLIC store-creation endpoint.
--
-- POST /api/tenants must stay unauthenticated (onboarding creates the store
-- before any user/token exists). The API now enforces auth on GET/PUT and
-- rate-limits POST per client IP using this table. The check is FAIL-OPEN in
-- the API, so a missing table never breaks onboarding — this migration simply
-- makes the control effective.
--
-- Idempotent.

CREATE TABLE IF NOT EXISTS public.onboarding_ip_log (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ip         text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS onboarding_ip_log_ip_time_idx
  ON public.onboarding_ip_log (ip, created_at DESC);

-- Written only by the service-role API layer; never exposed to the browser.
ALTER TABLE public.onboarding_ip_log ENABLE ROW LEVEL SECURITY;
