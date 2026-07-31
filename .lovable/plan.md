## Goal

Replace the current New Activity modal with the same UI Bharath Builders uses — the gradient "New Post" sheet with project avatar picker, inline date row, rich description box with camera/location/metrics/mic actions, activity-type chips, and status pill + Post button.

## What exists today

- `src/components/NewActivityModal.tsx` — a simplified lookalike: hardcoded Unsplash site images, hardcoded 4 activity-type chips, non-functional camera/location/metrics/mic buttons, no photos, no assignees, no edit mode.
- `src/pages/Activities.tsx` uses it only for creation (line ~1030) and falls back to the old plain dialog for editing.
- Bharath Builders uses `src/components/activities/CreativeActivityForm.tsx` (~1400 lines) for both create and edit.

## Plan

1. **Port the component** — create `src/components/activities/CreativeActivityForm.tsx` here, copied from Bharath Builders. Its dependencies already exist in this project: `useAudioRecorder`, `useUserProfile`, `useActivities` types, `CameraCapture`, `OpenGRNPicker`, `lib/procurement`, `utils/activityPhotos`, `utils/nativePermissions`.

2. **Adapt to this project's hook API** — `useActivities()` here exposes `createActivity`, `updateActivity`, `deleteActivity`, `fetchAttendanceForDate`, `checkInForDate`, but not `checkInActivity` / `checkOutActivity`. Those two props will be made optional, and the per-activity check-in/check-out button hidden when they aren't supplied. Everything else (real project list with images, real activity types from master, photo upload with GPS tagging, voice-to-text and audio note, assignee picker, risk/status pill, GRN inline receipt) is wired to existing hooks.

3. **Wire into Activities page** — replace the `NewActivityModal` block with `CreativeActivityForm`, using it for both create and edit (passing the activity being edited), and drop the legacy edit dialog path so both flows share one UI.

4. **Delete** `src/components/NewActivityModal.tsx` once unused, removing the hardcoded Unsplash image map and hardcoded chip list.

5. **Verify** — typecheck, then open `/activities` in a headless browser, launch the form, and screenshot it to confirm it matches the reference.

## Notes

- Site images will come from the real site records instead of stub Unsplash URLs, so sites without a photo show an initials/gradient avatar rather than a random building.
- No database changes needed.
