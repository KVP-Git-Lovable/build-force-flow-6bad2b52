# Dashboard sections missing on published site / APK

## What I found

Two separate causes — one is a real permission bug, the other is a stale published build.

### 1. Permission gate that no one can be granted (the real bug)

The "Attendance & Workforce" section on the dashboard is shown only when the user is an
admin or has the permission key `widget_admin_attendance_overview`.

Checked in the database:

- Suyog = role `admin`, security profile "Administrator" → sees everything.
- Shravan = role `user`, security profile "Sales Executive".
- The "Sales Executive" profile has 35 permission entries, and `widget_admin_attendance_overview`
  is **not one of them**. That key does not exist anywhere in the admin permission matrix,
  so it can never be granted to anybody.

Result: for every non-admin user, that section is silently hidden — in preview, on the
published site, and in the APK. It only looked like an "environment" issue because the
comparison was admin (Suyog) vs non-admin (Shravan).

The KPI cards themselves are all permitted for Shravan (activities, leads, attendance are
all readable in his profile), so all six cards render. The `0` values are real data:
lead/activity rows are row-level scoped to owner + reporting hierarchy, and Shravan owns
no leads or activities yet.

### 2. The published build is older than the preview

`https://locate.quickapp.ai/build-meta.json` currently reports build `1786709109550`,
which is roughly a week old. Anything added to the dashboard since then simply is not in
the deployed bundle. On top of that, the service worker serves hashed `/assets/*` files
cache-first, so returning visitors can keep an old shell until the version-sync reload
kicks in. The APK bundles `dist` at build time, so it is frozen at whatever was built.

## The fix

1. **Register the workforce widget as a real, grantable permission**
   - Add `widget_admin_attendance_overview` to the permission matrix definition
     (`src/components/security/permissionModules.ts`) so it appears in
     Security Management and can be toggled per security profile.

2. **Make the dashboard gate consistent**
   - In `src/components/dashboard/WorkforceOverviewSection.tsx`, keep the admin bypass and
     accept either `widget_admin_attendance_overview` or the already-existing
     `widget_team_attendance` key, so profiles configured before this fix (Sales Executive
     already has `widget_team_attendance`) get the section immediately instead of waiting
     for an admin to re-toggle it.

3. **Make hidden-by-permission explicit rather than silent**
   - While permissions are still loading, keep rendering nothing (current behaviour), but
     do not hide the block due to a failed/blank permission fetch — treat "no security
     profile" as full access, which the hook already does.

4. **Ship it to the published site and the APK**
   - Publish the project so `locate.quickapp.ai` picks up the current build; the existing
     `build-meta.json` version-sync will force old sessions to reload.
   - Bump `RELEASE_TOKEN` in `capacitor.config.ts` and rebuild/sync the Android app so the
     APK carries the new `dist`.

## Notes

- No database or RLS changes are needed; the zero KPI values for Shravan are correct data,
  not a visibility fault. If Shravan should see team-wide numbers, that is a separate
  request (reporting-hierarchy roll-up on the dashboard KPIs).
- After the fix, an admin can decide per profile whether the workforce block is visible,
  from Security Management.
