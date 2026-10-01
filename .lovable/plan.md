# Make Auto End Day and per-leave-type entitlements actually work

Both settings save correctly today, but nothing uses them. This plan connects them to real behavior.

## 1. Auto End Day
- A scheduled job runs every 5 minutes and reads the Auto End Day settings.
- When enabled and the configured close time passes (in the configured timezone), it checks out every attendance day that is still open, using the employee's last activity time (per the "last activity source" setting), and marks it as auto-closed.
- Optional steps follow the settings: close in-progress visits, cancel planned visits, mark the day unproductive.
- If the pre-warning is on, employees with an open day get an in-app and push notification at the warning time.
- Each day is closed only once, even if the job runs repeatedly.

## 2. Per-leave-type entitlement
- The monthly leave calculation uses the yearly entitlement, accrual type (monthly/quarterly), rounding and credit day saved in the Leave Policy editor. If a leave type has no editor settings, it falls back to its annual quota as it does today.
- The "apply from" choice is respected: retroactive recalculates the whole year, "this month" recalculates from the current month, "next month" from the following month.
- Saving the editor triggers a recalculation right away, so balances update without waiting for the monthly run.

## Technical details
- New edge function `auto-end-day` plus a pg_cron entry (`*/5 * * * *`), authenticated the same way as the daily export job; it writes `attendance.check_out_time` and an auto-closed flag, and uses `send_notification` for warnings.
- Update `recalculate_monthly_leave_accruals` to join `leave_policy` and `accrual_config` (frequency, divisor, round_mode, credit_day) and honor `last_update_mode`; call it from `LeavePolicyConfig` after save.
