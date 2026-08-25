/**
 * Shared GPS track filtering + distance calculation.
 *
 * EVERY distance display in the app (web Day Tracking, dashboard route card,
 * APK, check-out distance locking) must use these functions so all surfaces
 * show identical numbers for the same journey.
 */

export interface TrackPoint {
  latitude: number;
  longitude: number;
  timestamp: string;
  speed?: number | null;
  accuracy?: number | null;
}

const MAX_ACCURACY_METERS = 100; // reject cell-tower / Wi-Fi guesses
const MIN_MOVE_METERS = 20;      // stationary jitter threshold
const MAX_SPEED_KMH = 160;       // reject impossible jumps (highway upper bound)
const MAX_TIME_GAP_MINUTES = 5;  // longer gap = separate segment (no phantom line)

export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Filter a raw GPS track: drop low-accuracy fixes, stationary jitter,
 * impossible-speed jumps, and bridge long time gaps without inventing distance.
 * Input must be sorted by timestamp ascending.
 */
export function filterTrackPoints(points: TrackPoint[]): TrackPoint[] {
  // Pass 1: accuracy gate — unknown or poor accuracy is rejected
  const accurate = points.filter(
    (p) => p.accuracy != null && p.accuracy <= MAX_ACCURACY_METERS
  );

  const cleaned: TrackPoint[] = [];
  for (const curr of accurate) {
    if (cleaned.length === 0) {
      cleaned.push(curr);
      continue;
    }
    const prev = cleaned[cleaned.length - 1];
    const distM = haversineMeters(
      prev.latitude,
      prev.longitude,
      curr.latitude,
      curr.longitude
    );

    // Stationary jitter — user hasn't really moved
    if (distM < MIN_MOVE_METERS) continue;

    const timeDiffMs =
      new Date(curr.timestamp).getTime() - new Date(prev.timestamp).getTime();
    const timeDiffMinutes = timeDiffMs / 60000;

    // Long gap: start a new segment without adding phantom distance
    if (timeDiffMinutes > MAX_TIME_GAP_MINUTES) {
      cleaned.push(curr);
      continue;
    }

    const timeDiffHours = timeDiffMinutes / 60;
    const impliedSpeedKmh =
      timeDiffHours > 0 ? distM / 1000 / timeDiffHours : 0;

    if (impliedSpeedKmh <= MAX_SPEED_KMH) {
      cleaned.push(curr);
    }
    // else: impossible jump — reject the point
  }
  return cleaned;
}

/** Total straight-line distance (km) of an already-filtered track. */
export function computeDistanceKm(points: TrackPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineMeters(
      points[i - 1].latitude,
      points[i - 1].longitude,
      points[i].latitude,
      points[i].longitude
    );
  }
  return total / 1000;
}

/** Convenience: filter + distance in one call. */
export function computeFilteredDistanceKm(rawPoints: TrackPoint[]): number {
  return computeDistanceKm(filterTrackPoints(rawPoints));
}
