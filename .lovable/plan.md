## Diagnosis (verified)

- The role assignments **are** persisting. `user_security_profiles` currently holds 8 rows correctly linked to `security_profiles` (4 × Administrator, 4 × Sales Executive). The save path is not broken.
- The only SELECT policy on `user_security_profiles` is `Users can view own security profile` with `user_id = auth.uid()`.
- Result: the Users & Roles table query (`select user_id, profile_id, security_profiles(name)`) returns at most **one row** — the logged-in admin's own. Every other user falls through to `"—"`.
- `security_profiles` itself is readable by all authenticated users, so the embedded join is not the problem.

## Fix

**1. Database migration — add a read policy**

Add a SELECT policy on `public.user_security_profiles` allowing users who can manage security or edit users to read all assignments, reusing the existing helper functions already used by the INSERT/UPDATE/DELETE policies:

```
has_security_management_access(auth.uid(), 'view')
OR can_access_object(auth.uid(), 'users', 'view')
```

The existing self-view policy stays (policies are OR-ed), so ordinary users keep reading their own row for permission bootstrapping.

**2. Harden the save path in `src/pages/AdminUserManagement.tsx`**

The existing/insert branch silently swallowed errors and, because the `existing` lookup was blocked by RLS, always took the INSERT branch — which would have thrown a unique-constraint error on re-save if the errors weren't discarded. Replace lines 280–292 with a single upsert on `user_id` and throw on error so failures surface as a toast instead of a false success.

**3. Refresh behaviour**

Keep the existing invalidation of `admin-user-security-assignments`; with the read policy in place the refetch will return all rows.

## Note

No change is needed to `useProfilePermissions`, `SecurityProfilesList`, or `UserProfileAssignments` logic itself, but they read the same table — the Security Management screens were also under-reporting assignments for the same reason and will be corrected by the same policy.
