import { supabase } from "@/integrations/supabase/client";
import { haversineMeters } from "@/utils/gpsDistance";

interface RoutePoint {
  latitude: number;
  longitude: number;
}

export interface LatLng {
  lat: number;
  lng: number;
}

export interface SnappedRoute {
  /** Path to draw (road-snapped when `snapped` is true, raw track otherwise). */
  path: LatLng[];
  /** Actual road distance in metres, or null when routing was unavailable. */
  distanceMeters: number | null;
  snapped: boolean;
}

/**
 * Snap a GPS track to real roads using the Google Routes API (via the
 * `snap-gps-route` edge function, which calls the connector gateway).
 * Returns both the snapped path and the real road distance travelled.
 * Falls back to the raw straight-line track if routing fails.
 */
// Minimum leg length sent to the Routes API. Shorter hops are almost always
// stationary GPS drift (typical fix accuracy is ~35 m); routing them would snap
// each micro-hop out to the nearest road and back, roughly doubling the total.
const MIN_ROUTE_LEG_METERS = 150;

/**
 * Collapse micro-legs: emit a waypoint only when the accumulated distance from
 * the last emitted waypoint exceeds MIN_ROUTE_LEG_METERS. Returns the decimated
 * waypoints plus the straight-line meters that were skipped (so no distance is
 * lost — it is added back to the routed total).
 */
function decimateWaypoints(points: RoutePoint[]): { waypoints: RoutePoint[]; skippedMeters: number } {
  if (points.length < 2) return { waypoints: points.slice(), skippedMeters: 0 };
  const waypoints: RoutePoint[] = [points[0]];
  let skippedMeters = 0;
  let pendingMeters = 0;
  let prev = points[0];
  for (let i = 1; i < points.length; i++) {
    const curr = points[i];
    const legM = haversineMeters(prev.latitude, prev.longitude, curr.latitude, curr.longitude);
    pendingMeters += legM;
    if (pendingMeters >= MIN_ROUTE_LEG_METERS || i === points.length - 1) {
      waypoints.push(curr);
      skippedMeters += pendingMeters - haversineMeters(
        waypoints[waypoints.length - 2].latitude,
        waypoints[waypoints.length - 2].longitude,
        curr.latitude,
        curr.longitude
      );
      pendingMeters = 0;
    }
    prev = curr;
  }
  return { waypoints, skippedMeters: Math.max(0, skippedMeters) };
}

export async function getSnappedRoute(points: RoutePoint[]): Promise<SnappedRoute> {
  if (points.length < 2) return { path: [], distanceMeters: null, snapped: false };

  // Routes API allows up to 25 intermediates → 27 points per request.
  const MAX_PER_CALL = 25;
  const sampleRate = Math.ceil(points.length / 200);
  const sampled = points.filter((_, i) => i % sampleRate === 0 || i === points.length - 1);

  // Drop stationary-drift micro-legs before routing (see decimateWaypoints).
  const { waypoints, skippedMeters } = decimateWaypoints(sampled);
  if (waypoints.length < 2) {
    // No genuine movement — total is just the straight-line sum.
    return {
      path: points.map((p) => ({ lat: p.latitude, lng: p.longitude })),
      distanceMeters: null,
      snapped: false,
    };
  }

  const chunks: RoutePoint[][] = [];
  for (let i = 0; i < waypoints.length - 1; i += MAX_PER_CALL - 1) {
    const chunk = waypoints.slice(i, i + MAX_PER_CALL);
    if (chunk.length > 1) chunks.push(chunk);
  }

  try {
    const results = await Promise.all(
      chunks.map(async (chunk) => {
        const raw = chunk.map((p) => ({ lat: p.latitude, lng: p.longitude }));
        try {
          const { data, error } = await supabase.functions.invoke("snap-gps-route", {
            body: { points: raw },
          });
          if (error) throw error;
          const encoded = data?.polyline as string | null;
          const meters = Number(data?.distanceMeters);
          const path = encoded ? decodePolyline(encoded) : [];
          if (path.length < 2) throw new Error("empty route");
          return { path, meters: Number.isFinite(meters) ? meters : 0, snapped: true };
        } catch (e) {
          // A single chunk failing (e.g. transient gateway 503) must not drop
          // the whole trail — fall back to the raw track for this segment and
          // count its straight-line distance so the total isn't understated.
          console.warn("snap-gps-route chunk failed, using raw track", e);
          let fallbackMeters = 0;
          for (let i = 1; i < chunk.length; i++) {
            fallbackMeters += haversineMeters(
              chunk[i - 1].latitude,
              chunk[i - 1].longitude,
              chunk[i].latitude,
              chunk[i].longitude
            );
          }
          return { path: raw, meters: fallbackMeters, snapped: false };
        }
      })
    );

    const path = results.flatMap((r) => r.path);
    if (path.length < 2) throw new Error("empty route");
    const allSnapped = results.every((r) => r.snapped);
    const routedMeters = results.reduce((sum, r) => sum + r.meters, 0);
    // Add back the straight-line meters of the micro-legs we didn't route.
    // Failed chunks already contribute their straight-line distance, so the
    // total is meaningful even when only part of the track snapped to roads.
    const distanceMeters = routedMeters + skippedMeters;
    return {
      path,
      distanceMeters: distanceMeters > 0 ? distanceMeters : null,
      snapped: allSnapped,
    };
  } catch {
    return {
      path: points.map((p) => ({ lat: p.latitude, lng: p.longitude })),
      distanceMeters: null,
      snapped: false,
    };
  }
}


/** Decode a Google encoded polyline into lat/lng pairs. */
export function decodePolyline(encoded: string): LatLng[] {
  const path: LatLng[] = [];
  let index = 0,
    lat = 0,
    lng = 0;

  while (index < encoded.length) {
    let result = 0,
      shift = 0,
      b: number;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    path.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return path;
}
