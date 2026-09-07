# Mirror SBEE tables to the second project (twice daily)

Copy 39 tables from this app into the other Supabase project, each named with an `sbee_` prefix, refreshed automatically every day at 12:00 PM and 4:00 PM IST. Nothing in this project's data is modified — the copy only reads.

## Tables included (39)

- Activities: activity_events, activity_types_master
- Attendance: attendance, attendance_policy
- Customers: customers, customer_activities, customer_contacts, customer_contact_roles, customer_documents, customer_opportunities
- Leads: leads, lead_audit_log
- Expenses: expense_approval_rules, expense_approval_workflows, expense_categories, expense_groups, expense_group_members, expense_master_config, expense_overrides, expense_policy
- GPS: gps_tracking, gps_tracking_stops
- Master data: master_activity_outcomes, master_addresses, master_categories, master_currencies, master_entities, master_event_types, master_industries, master_lead_sources, master_lead_statuses, master_payment_terms, master_products, master_uom
- People and access: users, profiles, user_roles, user_security_profiles, profile_object_permissions

## What happens

1. **One SQL script for you to run in the other project.** I generate a script that creates all 39 `sbee_*` tables with matching columns, primary keys and the enum types they need. No foreign keys and no row-level security are copied — the mirror is a flat reporting copy, and access there is service-key only. You paste it into the other project once.
2. **A copy job in this project.** A new backend function reads each table here in batches of 500 rows and writes them into the matching `sbee_*` table in the other project, matching on the record id so re-runs update instead of duplicating. Rows deleted here are also removed there, so the mirror stays a true reflection.
3. **Schedule.** The job runs automatically at 12:00 PM and 4:00 PM IST (06:30 and 10:30 UTC). It can also be triggered manually.
4. **Result log.** Each run returns per-table counts and any errors so failures are visible rather than silent.

## Technical notes

- New edge function `mirror-to-sbee`: service-role read on source, writes to `https://ylvhhlykyojudldcmzou.supabase.co/rest/v1/sbee_<table>` with `Prefer: resolution=merge-duplicates` upserts, batch size 500.
- The target service role key is stored as a backend secret (`SBEE_MIRROR_SERVICE_KEY`), never in code; the target URL as `SBEE_MIRROR_URL`.
- Deletion handling: after upserting a table, the function collects the source id set per batch and deletes target rows whose id is not present (done per table with a paged id sweep).
- Scheduling via `pg_cron` + `pg_net` in this project, two jobs at `30 6 * * *` and `30 10 * * *` UTC calling the function.
- Enum columns are created as text in the target to avoid enum drift; timestamps and jsonb keep their types.
- Migration in this project is limited to enabling `pg_cron`/`pg_net` and creating the two schedule entries — no table or data changes here.
