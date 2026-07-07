## Goal

When any active user's device drops **below 30% battery (not charging)** or goes **offline / switched off**, send an in-app notification to that user's **reporting manager** (the "Manager" column of Users & Roles). Repeat while the condition persists, without spamming.

## What already exists

- `useDeviceStatusReporter` posts `battery_level`, `battery_charging`, `network_type`, `device_platform`, and stamps `device_status_at` on `public.users` every 60s via the `report_device_status` RPC.
- Trigger `trg_notify_manager_low_battery` fires once when battery crosses into <30% and notifies both the manager AND all admins. It does NOT re-alert, and it also alerts admins (which you don't want).
- `public.notifications` table + `NotificationBell` already render in-app notifications.
- `public.users.reporting_manager_id` holds the manager link.

## Changes

### 1. Low-battery notifications → manager only, repeat every 10 min

Replace the current trigger logic with a check that:

- Fires only for the **reporting manager** of the affected user (no admin fan-out).
- Sends the first alert when battery drops <30% and not charging.
- Re-alerts every **10 minutes** while battery stays <30% and not charging, by looking up the most recent low-battery notification for that (manager, user) pair in `notifications` and skipping if it's <10 min old.
- Resets automatically once battery recovers ≥30% or device starts charging — the next low episode alerts again immediately.

Message: `Battery level is below 30% for user <Full Name>` (title: `Low battery: <Full Name>`, type: `warning`, related_table: `users`, related_id: user id).

Implementation: rewrite `notify_manager_low_battery()` with the throttle + manager-only logic; keep the existing `AFTER UPDATE OF battery_level` trigger. Because heartbeats fire every 60s, the trigger re-evaluates naturally and can emit a repeat notification once 10 minutes have elapsed.

### 2. Phone-off / offline notifications → manager, immediate + every 10 min

A device is considered "switched off" when `device_status_at` is older than a small grace window (2 min — one missed heartbeat) AND `is_active = true`. Because a switched-off phone can't call the RPC itself, this can't be a trigger; it needs a scheduled sweep.

Add a scheduled job that runs every minute and, for each active user whose `device_status_at` is stale:

- Sends the **first** notification to the reporting manager as soon as staleness is detected.
- Re-notifies every **10 minutes** thereafter while the device stays offline, throttled by looking up the most recent offline notification for that (manager, user) pair.
- Stops automatically the moment `device_status_at` refreshes (device came back online).

Message: `User <Full Name>'s phone appears to be switched off or offline` (title: `Device offline: <Full Name>`, type: `warning`, related_table: `users`, related_id: user id).

Implementation: a new SECURITY DEFINER SQL function `public.sweep_offline_device_alerts()` scheduled via `pg_cron` every 1 minute. No edge function needed — pure SQL keeps it inside the DB.

### 3. Safeguards

- Skip users with no `reporting_manager_id` (nothing to notify).
- Never notify a user about themselves (manager ≠ user).
- Only consider `is_active = true` users.
- Only consider users who have reported at least once (`device_status_at IS NOT NULL`) so brand-new accounts aren't flagged as offline.

## Out of scope

- No changes to `useDeviceStatusReporter`, notification UI, push delivery, or any other module.
- Admins are removed from the low-battery fan-out per your requirement that only the manager receives it.

## Technical details

- New/updated SQL objects (all via one migration):
  - `notify_manager_low_battery()` rewritten: manager-only, 10-minute throttle keyed off `notifications.title LIKE 'Low battery:%' AND related_id = NEW.id AND user_id = manager_id`.
  - New `sweep_offline_device_alerts()` SECURITY DEFINER function: scans `users` for `is_active AND device_status_at < now() - interval '2 minutes'`, applies the same throttle against `'Device offline:%'` notifications with a 10-minute window, inserts one row per due manager/user pair.
- Enable `pg_cron` extension (if not already) and schedule `sweep_offline_device_alerts()` every minute via `cron.schedule`.
- Throttle windows: `10 minutes` for both cases.
- Offline detection window: `2 minutes` since last heartbeat.
