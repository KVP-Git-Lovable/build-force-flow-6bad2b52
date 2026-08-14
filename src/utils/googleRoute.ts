import { supabase } from "@/integrations/supabase/client";

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
export async function getSnappedRoute(points: RoutePoint[]): Promise<SnappedRoute> {
  if (points.length < 2) return { path: [], distanceMeters: null, snapped: false };

  // Routes API allows up to 25 intermediates → 27 points per request.
  const MAX_PER_CALL = 25;
  const sampleRate = Math.ceil(points.length / 200);
  const sampled = points.filter((_, i) => i % sampleRate === 0 || i === points.length - 1);

  const chunks: RoutePoint[][] = [];
  for (let i = 0; i < sampled.length - 1; i += MAX_PER_CALL - 1) {
    const chunk = sampled.slice(i, i + MAX_PER_CALL);
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
          // the whole trail — fall back to the raw track for this segment.
          console.warn("snap-gps-route chunk failed, using raw track", e);
          return { path: raw, meters: 0, snapped: false };
        }
      })
    );

    const path = results.flatMap((r) => r.path);
    if (path.length < 2) throw new Error("empty route");
    const allSnapped = results.every((r) => r.snapped);
    const distanceMeters = results.reduce((sum, r) => sum + r.meters, 0);
    return {
      path,
      distanceMeters: allSnapped && distanceMeters > 0 ? distanceMeters : null,
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
