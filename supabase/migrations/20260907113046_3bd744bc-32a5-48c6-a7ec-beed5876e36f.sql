-- Daily data export: table enumeration RPC + pg_cron schedule that invokes
-- the daily-data-export edge function at 12:45 UTC (18:15 IST; IST has no
-- DST, so the cron time never shifts).

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Enumerate every public table for the export. SECURITY DEFINER + service
-- role only: clients must never be able to list schema internals, and a
-- dynamic list can't drift the way export-to-quicklocate's hardcoded one did.
CREATE OR REPLACE FUNCTION public.list_export_tables()
RETURNS SETOF text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT tablename::text
  FROM pg_tables
  WHERE schemaname = 'public'
  ORDER BY tablename;
$$;

REVOKE EXECUTE ON FUNCTION public.list_export_tables() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_export_tables() TO service_role;

-- Idempotent (re)schedule, matching the repo's existing cron pattern.
DO $$
DECLARE
  jid bigint;
BEGIN
  FOR jid IN SELECT jobid FROM cron.job WHERE jobname = 'daily-sbee-data-export'
  LOOP
    PERFORM cron.unschedule(jid);
  END LOOP;
END;
$$;

SELECT cron.schedule(
  'daily-sbee-data-export',
  '45 12 * * *',
  $$
  DO $job$
  DECLARE
    v_supabase_url text;
    v_service_key text;
  BEGIN
    SELECT decrypted_secret INTO v_supabase_url
      FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1;
    SELECT decrypted_secret INTO v_service_key
      FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1;

    IF v_supabase_url IS NOT NULL AND v_service_key IS NOT NULL THEN
      PERFORM extensions.http_post(
        url := v_supabase_url || '/functions/v1/daily-data-export',
        body := '{}'::jsonb,
        headers := json_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_service_key
        )::jsonb
      );
    END IF;
  END
  $job$;
  $$
);