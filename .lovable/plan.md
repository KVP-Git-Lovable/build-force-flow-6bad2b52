# Fix: show actual road route and real distance on GPS Tracking

## Diagnosis (verified)

- The Google Routes API integration is **working**: a live test of the `snap-gps-route` backend function returned a valid road-snapped polyline and `distanceMeters: 3842` for a 3-point route.
- The page code already *prefers* road distance: `GPSTracking.tsx` calls `getSnappedRoute()` and uses `route.distanceMeters` when available, falling back to straight-line (Haversine) only when routing fails.
- The "Traveled: 0.0 km" in the screenshot means the page silently fell back. Likely causes:
  1. **Too few usable GPS points** — after session-window + accuracy/jitter filtering, fewer than 2 real movement points remain for that user/date (the pins visible on the map are activity/stop markers, not GPS track points). With <2 points, no route is requested and distance shows 0.0.
  2. **Silent chunk failure** — if the routing call fails, `getSnappedRoute` returns `distanceMeters: null` and the page shows the straight-line estimate with no indication of what happened.
  3. **Long tracks** — the route is sampled to ~200 points and chunked into ≤25-waypoint calls; multi-day ranges can produce many chunks, and any failure zeroes that chunk's distance.

## What changes

1. **Surface the route status instead of failing silently**
   - Show a small label under the Distance card / map badge: "road distance" (already exists) vs "estimated (straight-line)" vs "no route — not enough GPS points".
   - When routing fails, log the reason to the console and show a subtle "route unavailable" hint so it's diagnosable instead of looking like 0 km.

2. **Handle sparse data gracefully**
   - If filtering leaves <2 points but raw points exist, fall back to routing the raw (unfiltered) points so a route and distance still appear.
   - If there are genuinely no GPS points for the period, show "No movement recorded" instead of "0.0 km".

3. **Make chunked routing distance robust**
   - In `getSnappedRoute`, when some chunks snap and some fail, sum the road distance of snapped chunks plus the straight-line distance of failed chunks (instead of discarding the whole road distance), and mark the result as "partially estimated".

4. **Verify with real data**
   - Query the actual `gps_tracking` rows for the affected user/date (e.g. Bhavik Rathor, Aug 25) to confirm how many points survive filtering, and validate the fix against that real track.

## Technical details

- `src/pages/GPSTracking.tsx`: add route-status state (`road` | `estimated` | `partial` | `none`), render the appropriate label, raw-point fallback when filtered points < 2.
- `src/utils/googleRoute.ts`: per-chunk fallback distance (Haversine for failed chunks) instead of zeroing; return a `partial` flag.
- No backend change needed — `snap-gps-route` already returns `distanceMeters` and is confirmed working.
- No changes to GPS capture, filtering thresholds, or other pages.
