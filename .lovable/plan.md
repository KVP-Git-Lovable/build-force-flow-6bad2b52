# Add Battery % and Network Strength to My Team + low-battery alerts to managers

## What we're building

1. Every device running the app reports its own battery %, charging state, and network type to the backend once per minute while the app is open.
2. `/my-team` shows each teammate's latest battery % and network strength next to their name, with a stale-data indicator when the reading is older than ~3 minutes.
3. When a teammate's battery drops below 30%, a push + in-app notification fires to their **reporting manager** (and admins) — not to the teammate themselves.

## Storage

Add four columns directly on `public.users` (per your choice):

- `battery_level int` — 0-100, nullable
- `battery_charging boolean` — nullable
- `network_type text` — one of `wifi | 4g | 3g | 2g | slow-2g | offline | unknown`
- `device_status_at timestamptz` — last report time
- (also) `device_platform text` — `web-android | web-ios | web-desktop | android-native | ios-native` — needed so the UI can show "—" for iOS web where battery is unreadable

RLS: user can UPDATE only their own row's status columns; SELECT is already permitted for team lookups. A partial policy will restrict writes to these five columns via a `SECURITY DEFINER` RPC (`report_device_status`) — safer than granting broad UPDATE.

## Client — reporting side (every device, every 1 min)

New hook `src/hooks/useDeviceStatusReporter.ts` mounted once in `AppLayout`:

- Reads battery from `navigator.getBattery()` when available (Android Chrome, desktop Chrome/Edge). iOS Safari returns undefined → we send `null`.
- Reads network from `navigator.connection.effectiveType` (`4g` / `3g` / `2g` / `slow-2g`) plus `navigator.onLine`. iOS Safari → `unknown`.
- Detects platform from `navigator.userAgent` + Capacitor detection so we can set `device_platform`.
- Calls the `report_device_status` RPC every 60s while document is visible; pauses on `visibilitychange` hidden; resumes + sends immediately on visible.
- On native Capacitor (Android APK), swaps in `@capacitor/device` + `@capacitor/network` for reliable values and detects `Device.getBatteryInfo()` — this covers the APK case since your project already ships Capacitor.

We will **not** add `@capacitor-community/battery-status` right now to keep dependencies minimal; `@capacitor/device` (already commonly present) exposes battery info sufficiently.

## Client — display side (`src/pages/MyTeam.tsx`)

Extend the `TeamMember` shape with the four new fields, then in each row render two small badges after the name:

- **Battery**: icon + `72%` (green ≥50, amber 30-49, red <30). If `battery_level` is null → show `—` with tooltip "Not reported by device (e.g. iOS Safari)".
- **Network**: signal-bars icon mapped from `network_type` (`wifi`/`4g` = 4 bars, `3g` = 3, `2g` = 2, `slow-2g` = 1, `offline` = 0, `unknown` = —).
- **Stale indicator**: if `device_status_at` is older than 3 minutes, dim both badges and show a tiny "· 12m ago" text.

No layout change to the existing card — badges sit between the role/site line and the phone button, wrapping on narrow screens.

## Manager low-battery alert (server-side)

Trigger on `public.users` AFTER UPDATE of `battery_level`:

- When new `battery_level < 30` AND old value ≥ 30 (crossing the threshold, not spamming every 1-min tick while still low), and `battery_charging = false`:
  - Look up the teammate's reporting manager via `users.reporting_manager_id` (walking up 1 level) plus all admins.
  - Insert a row into `public.notifications` for each recipient: title `"Low battery: {full_name}"`, message `"{full_name}'s device is at {level}% and not charging."`, type `warning`, related_table `users`, related_id = teammate id.
  - Invoke existing `dispatch-notification` edge function so managers who opted in get a web/native push too.

Re-arms when battery goes back ≥ 30 (either by charging or reconnecting a fresher device), so the next drop below 30 fires again.

## Notifications UI

Existing `NotificationBell` component already renders `public.notifications` rows, so managers will see the low-battery alerts in the bell + as a push (if push is enabled) — no new UI needed beyond that.

## Files to change / add

- Migration: add 5 columns to `public.users`; create `report_device_status(_battery int, _charging bool, _network text, _platform text)` SECURITY DEFINER RPC; create `notify_manager_low_battery()` trigger fn + trigger.
- New: `src/hooks/useDeviceStatusReporter.ts`.
- Edit: `src/components/layout/AppLayout.tsx` — mount the reporter hook once.
- Edit: `src/pages/MyTeam.tsx` — select the four new fields, render battery/network badges.
- New: `src/components/team/DeviceStatusBadges.tsx` — small presentational component for the two badges.

## Trade-offs / caveats you should know

- **iOS Safari users show "—" for both metrics.** Only fix is the native APK path (already available via Capacitor).
- **1-min reporting = ~1,440 writes/user/day.** For a 50-person team that's ~72k row updates/day on `public.users`. Acceptable but noticeable on Cloud usage. If you later see cost pressure, we can switch to "significant change only" without touching the schema.
- **Network "strength" is coarse.** The Web APIs don't give bars/dBm — the badge shows the connection *type*, which most users read as "signal quality" anyway. If you need actual signal bars, that requires a fully native module (not just Capacitor's standard plugins).
- **Trigger fires only on threshold cross.** If a phone stays at 15% for hours, the manager gets one alert, not one every minute. That's intentional; tell me if you'd rather get repeated reminders every N minutes.
