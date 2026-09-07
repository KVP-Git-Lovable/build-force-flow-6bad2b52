CREATE TABLE IF NOT EXISTS public.export_job_auth (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.export_job_auth TO service_role;

ALTER TABLE public.export_job_auth ENABLE ROW LEVEL SECURITY;

-- No policies: only the service role (backend jobs) may read or write this table.