# Why `activity_sessions` has 0 rows

## Findings (verified)

- The table exists and is empty: `select count(*) from activity_sessions` returns 0, and Postgres table stats show `n_tup_ins = 0`, `n_tup_del = 0` — no row was ever inserted, nothing was deleted. So this is not data loss.
- The only writer is the `manage-activity-session` edge function (`action: "checkin" / "checkout"`). Its logs show **no invocations at all**.
- The only caller of that function is `handleActivityCheckIn` / `handleActivityCheckOut` in `CreativeActivityForm.tsx`. Those handlers run only when the parent passes a `checkInActivity` / `checkOutActivity` prop.
- `Activities.tsx` and `LeadActivityComposer.tsx` are the only components that render `CreativeActivityForm`, and **neither passes those props**. The form also gates the button with `showCheckIn = cfgCheckIn && !!checkInActivity`, so the per-activity check-in button never renders.

Conclusion: `activity_sessions` is dead infrastructure. The per-activity check-in/check-out UI that was supposed to fill it was never wired up, so the table has been empty since it was created. Day Tracking read from it, which is why the trail went blank — already fixed by switching that gate to `attendance`.

Related dead code: `validate-gps-session` edge function (called by `capacitorBackgroundTracking.ts` to validate each GPS point against `activity_sessions`) will always fail to find a session. Worth checking whether that path is silently dropping background GPS points.

## Options

**A. Remove the dead path (recommended)**
- Drop the unused `manage-activity-session` and `validate-gps-session` invocations from `CreativeActivityForm.tsx` and `capacitorBackgroundTracking.ts`, delete both edge functions, and leave `attendance` as the single source of check-in windows.
- Keep or drop the `activity_sessions` table itself (no data to lose either way).

**B. Wire it up properly**
- Pass `checkInActivity` / `checkOutActivity` from `Activities.tsx` so the per-activity check-in button appears and sessions actually get created. Only worth doing if you want per-activity (not per-day) time tracking as a product feature.

**C. Leave as is**
- No code change; Day Tracking already uses `attendance`. The table stays empty and the two edge functions stay unused.

## Next step

Confirm which option you want. If it's A, I will also verify whether `validate-gps-session` is currently blocking background GPS writes on native, and remove that gate in the same change.
