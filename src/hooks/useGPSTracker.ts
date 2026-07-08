import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentPosition } from "@/utils/nativePermissions";
import { format } from "date-fns";

const INTERVAL_MS = 60_000; // capture every 60s
const MIN_MOVE_METERS = 15; // skip near-duplicate points

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

/**
 * Continuously captures GPS points into `gps_tracking` while the user's
 * attendance day is active (checked in, not checked out). Points feed the
 * TA-from-GPS calculation and the Day Tracking map.
 */
export function useGPSTracker(userId: string | null | undefined) {
  const timerRef = useRef<number | null>(null);
  const lastPointRef = useRef<{ lat: number; lng: number } | null>(null);
  const runningRef = useRef(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    async function tick() {
      if (cancelled || runningRef.current) return;
      runningRef.current = true;
      try {
        const today = format(new Date(), "yyyy-MM-dd");
        const { data: att } = await supabase
          .from("attendance")
          .select("check_in_time, check_out_time")
          .eq("user_id", userId)
          .eq("date", today)
          .maybeSingle();

        // Only track while day is open
        if (!att?.check_in_time || att?.check_out_time) return;

        const pos = await getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 });
        const cur = { lat: pos.latitude, lng: pos.longitude };

        if (lastPointRef.current) {
          const dist = haversineMeters(lastPointRef.current, cur);
          if (dist < MIN_MOVE_METERS) return;
        }
        lastPointRef.current = cur;

        await supabase.from("gps_tracking").insert({
          user_id: userId,
          latitude: cur.lat,
          longitude: cur.lng,
          accuracy: pos.accuracy ?? null,
          timestamp: new Date().toISOString(),
          date: today,
        });
      } catch (e) {
        // silent — permission denied, offline, etc.
      } finally {
        runningRef.current = false;
      }
    }

    // Fire immediately, then poll
    tick();
    timerRef.current = window.setInterval(tick, INTERVAL_MS);

    const onVisibility = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      if (timerRef.current) window.clearInterval(timerRef.current);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [userId]);
}
