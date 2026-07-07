## Goal

Replace the current thin Expense Configuration and Expenses pages with Quickapp's full TA/DA policy engine, categories/workflows/rules, and monthly My Expenses view. Skip Petty Cash. Replace "From Beat" TA with GPS.

## 1. Database

**Migration — extend/add tables** (types.ts regenerated after):

- `expense_master_config`: add `ta_per_km_rate numeric default 0`, `da_calculation_basis text default 'per_day' check in ('per_day','per_half_day')`. Enforce `ta_type` in (`'fixed'`,`'from_gps'`); backfill legacy `from_beat` → `from_gps`.
- `expense_policy`: add `max_additional_expense_per_day numeric default 0`, `max_additional_expense_per_month numeric default 0`, `require_bill_above_amount numeric default 500` (stop overloading unrelated columns as the current Admin page does).
- New `expense_overrides` (user/team TA & DA overrides):
  columns: `id`, `field text check in ('ta','da')`, `ref_type text check in ('user','team')`, `ref_id uuid`, `amount numeric not null default 0`, `created_at`, `updated_at`. Unique on `(field, ref_type, ref_id)`.
- New `expense_groups`: `id`, `name text not null`, `description text`, `ta_type text default 'fixed'`, `fixed_ta_amount numeric default 0`, `ta_per_km_rate numeric default 0`, `da_amount numeric default 0`, `created_at`, `updated_at`.
- New `expense_group_members`: `id`, `group_id uuid fk expense_groups on delete cascade`, `user_id uuid`, unique `(group_id,user_id)`.
- All new tables: GRANT to `authenticated` and `service_role`; enable RLS; admin write via `has_role(auth.uid(),'admin')`, authenticated read.
- New RPC `get_monthly_expense_summary(_user_id uuid, _year_month text)` returning JSON: `{ ta, da, additional_approved, additional_pending, total, present_days, total_km, order_value, weekly:[{week_start,ta,da,additional}], daily:[{date,ta,da,additional,km}] }`. TA computed via effective rate: user override → group → team (manager) override → global; if `ta_type='from_gps'` uses `sum(gps_tracking.total_km_today)` × per-km rate, else fixed × present days. DA similarly per present day (half-day counts as 0.5 when basis='per_half_day' and attendance is half day).

## 2. Admin — `src/pages/AdminExpenseManagement.tsx`

Replace current single-page layout with Quickapp's 2-tab shell (Petty Cash omitted):

```
Tabs: [Overview] [Configuration]
```

- Header: gradient card, `Receipt` icon, title "Expense Master", subtitle "Manage expense policies, approvals & team productivity".
- **Overview tab**: reuse existing `TeamExpenseSummary` component wrapped in a productivity-style panel (KPIs: month spend, pending approvals, approved, top spenders).
- **Configuration tab** — new component `src/components/expenses/ExpensePolicyConfig.tsx` (adapted from Quickapp, GPS/Fixed only):
  1. **Travel Allowance (TA) Policy** card
     - `TA Calculation Method` select: `Fixed Amount`, `From GPS Tracking` (default).
     - Fixed → `Fixed TA Amount (₹)`; GPS → `Per KM Rate (₹)` with example line "If rate is ₹8/km and user travels 45 km, TA = ₹360".
     - Distribution: `Same for all` / `Custom per user/team` radio.
     - When Custom: `OverrideTable` (users + teams add via popover multi-select) + `InlineGroupSection` for TA groups (create/edit/manage members/delete). Priority note: User → Group → Team → Global.
  2. **Daily Allowance (DA) Policy** card
     - `DA Amount (₹)` + `Calculation Basis` (`Per Day` / `Per Half Day`).
     - Same distribution / overrides / groups pattern as TA.
  3. **Additional Expenses Policy** card
     - `Max per Day (₹)` (0 = no limit), `Max per Month (₹)` (0 = no limit), `Bill Required Above (₹)` — bound to real `expense_policy` columns added in the migration.
  4. **Expense Categories** — keep existing table (Add/Edit/Toggle/Delete).
  5. **Approval Workflows** — keep existing collapsible list.
  6. **Approval Rules** — keep existing priority-ordered list.
- Reusable subcomponents (memoized, module-scope to avoid remount): `MultiProfileSelector`, `OverrideTable`, `InlineGroupSection`, `GroupDialog`, `GroupMembersDialog` — colocated in `src/components/expenses/`.

## 3. My Expenses — `src/pages/Expenses.tsx`

Rewrite around the new monthly summary, keeping current add/edit dialog for additional expenses.

- Header: "Expenses" title only.
- Tabs (shown when applicable): `My Expenses` (always), `Team Summary` (managers/admins only). No Petty Cash tab.
- **My Expenses** content:
  - `MonthNavigator` (‹ July 2026 ›) — new small component in `src/components/expenses/`.
  - `ExpenseSummaryCards` (new): 5 cards — Travel (TA) ₹, Daily (DA) · Nd ₹, Additional ₹, Total Expenses ₹, Order Value ₹ (order value = 0 for now / sourced from `orders` sum if present). Total card is clickable → opens Breakdown dialog.
  - Breakdown dialog with `Weekly` / `Daily` toggle (`WeeklyBreakdown`, `DailyBreakdown` components). Data from `get_monthly_expense_summary`.
  - Expense Details section (per-day list with TA/DA/Additional sub-tabs) — new lightweight component derived from the daily breakdown, with per-row `Add Expense` opening the existing dialog. Reuse current add/edit/delete flow and `expense-bills` storage upload.
- **Team Summary** tab: existing `TeamExpenseSummary` unchanged.
- Manager detection via `useCurrentUser` role + `get_user_hierarchy` (same pattern as today).

## 4. Files

**New**
- `src/components/expenses/ExpensePolicyConfig.tsx`
- `src/components/expenses/MultiProfileSelector.tsx`
- `src/components/expenses/OverrideTable.tsx`
- `src/components/expenses/ExpenseGroupsInline.tsx` (group section + dialogs)
- `src/components/expenses/MonthNavigator.tsx`
- `src/components/expenses/ExpenseSummaryCards.tsx`
- `src/components/expenses/WeeklyBreakdown.tsx`
- `src/components/expenses/DailyBreakdown.tsx`
- `src/hooks/useMonthlyExpenseSummary.ts` (wraps the new RPC)
- `src/hooks/useExpenseConfig.ts` (config + overrides + groups CRUD)

**Modified**
- `src/pages/AdminExpenseManagement.tsx` — replace with tabbed shell described above.
- `src/pages/Expenses.tsx` — replace body with monthly summary UI; keep add/edit dialog + camera capture.
- `src/components/expenses/TeamExpenseSummary.tsx` — no behavior change; ensure it still works from Admin Overview & user Team tab.

**Untouched**
- Existing hooks/components unrelated to expenses; beats/petty-cash left alone.

## 5. Notes / Non-goals

- Petty Cash: not included.
- Beat-based TA path removed; existing `expense_master_config.ta_type='from_beat'` rows will be migrated to `'from_gps'` with `ta_per_km_rate=0` (admin can set).
- No changes to `additional_expenses` schema; auto-approval by category limit continues to work.
- Design tokens only (no hardcoded colors); mobile-first, matching existing app theme (Navy & Gold, gradient-subtle backgrounds).
