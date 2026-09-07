# Daily 6:15 PM IST data export by email

## Current state (verified)

The export code already exists in the project files: an export routine that reads every table, turns each into a CSV, bundles them into one ZIP and emails it through Resend, plus a schedule script for 6:15 PM IST.

However, checks against the live production database show it is **not active**:
- the helper that lists the tables to export does not exist in the database
- the only scheduled jobs present are the two SBEE mirror jobs (12 PM and 4 PM IST); there is no export job

So nothing is being emailed today. The work is to activate what is already written, without touching any existing logic.

## What will be done

1. Apply the database setup: create the table-listing helper (restricted so only the backend job can use it) and register the daily schedule at 6:15 PM IST. The two existing mirror jobs stay exactly as they are.
2. Publish the export routine so the schedule can call it.
3. Run it once immediately as a live test and confirm Resend accepted the message, then report the table count, row count and ZIP size.

## Behaviour

- Runs every day at 6:15 PM IST (fixed, no daylight-saving shift).
- Email from the Resend default sender to Abhishek.S@kvpcorp.com, subject "SBEE data export", body "Please find SBEE data export", with one ZIP attached named `sbee-export-YYYY-MM-DD.zip`.
- Every table in the database is included automatically, so new tables are picked up without further changes.
- If a single table fails to read, the rest still go out and a small error note is placed inside the ZIP for that table.
- The export only reads data; nothing in this project is modified.

## Technical notes

- Migration `supabase/migrations/20260907120000_daily_data_export.sql`: `public.list_export_tables()` (SECURITY DEFINER, execute granted to `service_role` only) and a `cron.schedule('daily-sbee-data-export', '45 12 * * *', ...)` entry that posts to the function with the service-role bearer token via `pg_net`.
- Edge function `supabase/functions/daily-data-export/index.ts`: paginated `.range()` reads at 1000 rows per page, `fflate` zip, base64 attachment to `https://api.resend.com/emails` with the existing `RESEND_API_KEY` secret. It rejects any call whose Authorization header is not the service-role key.
- Verification: invoke the function with the service-role token and check the returned summary plus the Resend message id.
