import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentPosition, isNative } from "@/utils/nativePermissions";
import { format } from "date-fns";

const INTERVAL_MS = 60_000;          // sample at least every 60s
const MIN_MOVE_METERS = 100;         // OR every 100m of movement
const FOREGROUND_POLL_MS = 60_000;   // web / non-native fallback

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
 * attendance day is active (checked in, not checked out).
 *
 * On native (Capacitor) it uses @capacitor-community/background-geolocation
 * so tracking survives the app being backgrounded / screen-locked. A
 * persistent Android notification lets the user know tracking is active.
 *
 * On web it falls back to foreground polling.
 *
 * Sampling rule: insert a point when EITHER 60s has elapsed OR the user has
 * moved ≥100m since the last stored point (whichever fires first).
 */
export function useGPSTracker(userId: string | null | undefined) {
  const activeRef = useRef(false);
  const lastPointRef = useRef<{ lat: number; lng: number; ts: number } | null>(null);
  const timerRef = useRef<number | null>(null);
  const watcherIdRef = useRef<string | null>(null);
  const foregroundBusyRef = useRef(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    let stopBackground: (() => Promise<void>) | null = null;
    let pollTimer: number | null = null;

    async function isDayOpen(): Promise<boolean> {
      const today = format(new Date(), "yyyy-MM-dd");
      const { data: att } = await supabase
        .from("attendance")
        .select("check_in_time, check_out_time")
        .eq("user_id", userId!)
        .eq("date", today)
        .maybeSingle();
      return !!att?.check_in_time && !att?.check_out_time;
    }

    async function insertPoint(lat: number, lng: number, accuracy: number | null) {
      const now = Date.now();
      const last = lastPointRef.current;
      if (last) {
        const dist = haversineMeters(last, { lat, lng });
        const elapsed = now - last.ts;
        if (dist < MIN_MOVE_METERS && elapsed < INTERVAL_MS) return;
      }
      lastPointRef.current = { lat, lng, ts: now };
      const today = format(new Date(), "yyyy-MM-dd");
      await supabase.from("gps_tracking").insert({
        user_id: userId!,
        latitude: lat,
        longitude: lng,
        accuracy,
        timestamp: new Date().toISOString(),
        date: today,
      });
    }

    async function startNativeBackground() {
      try {
        const { registerPlugin } = await import("@capacitor/core");
        const BackgroundGeolocation: any = registerPlugin("BackgroundGeolocation");
        if (!BackgroundGeolocation?.addWatcher) return false;

        const watcherId = await BackgroundGeolocation.addWatcher(
          {
            backgroundMessage: "Tracking your workday location. Tap to open JOVO.",
            backgroundTitle: "JOVO — Day Tracking active",
            requestPermissions: true,
            stale: false,
            distanceFilter: 25, // OS-level filter; we further throttle in insertPoint
          },
          async (location: any, error: any) => {
            if (error || !location) return;
            if (!activeRef.current) return;
            if (cancelled) return;
            try {
              await insertPoint(location.latitude, location.longitude, location.accuracy ?? null);
            } catch { /* ignore */ }
          }
        );
        watcherIdRef.current = watcherId;

        // Extra 60s heartbeat — force a sample even when stationary
        pollTimer = window.setInterval(async () => {
          if (!activeRef.current || cancelled) return;
          try {
            const pos = await getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 });
            await insertPoint(pos.latitude, pos.longitude, pos.accuracy ?? null);
          } catch { /* ignore */ }
        }, INTERVAL_MS);

        stopBackground = async () => {
          try {
            if (watcherIdRef.current) {
              await BackgroundGeolocation.removeWatcher({ id: watcherIdRef.current });
              watcherIdRef.current = null;
            }
          } catch { /* ignore */ }
        };
        return true;
      } catch (e) {
        console.warn("[GPSTracker] background plugin unavailable, falling back", e);
        return false;
      }
    }

    async function startForeground() {
      const tick = async () => {
        if (cancelled || foregroundBusyRef.current) return;
        if (!activeRef.current) return;
        foregroundBusyRef.current = true;
        try {
          const pos = await getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 });
          await insertPoint(pos.latitude, pos.longitude, pos.accuracy ?? null);
        } catch { /* ignore */ } finally {
          foregroundBusyRef.current = false;
        }
      };
      tick();
      timerRef.current = window.setInterval(tick, FOREGROUND_POLL_MS);
    }

    async function evaluate() {
      const open = await isDayOpen();
      activeRef.current = open;
      if (!open) {
        // Day closed → stop background watcher if any
        if (stopBackground) { await stopBackground(); stopBackground = null; }
        if (pollTimer) { window.clearInterval(pollTimer); pollTimer = null; }
        if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null; }
      }
    }

    (async () => {
      await evaluate();
      if (!activeRef.current) {
        // Re-check periodically in case user checks in later
        const recheck = window.setInterval(async () => {
          if (cancelled) return;
          await evaluate();
          if (activeRef.current) {
            window.clearInterval(recheck);
            if (isNative()) {
              const ok = await startNativeBackground();
              if (!ok) await startForeground();
            } else {
              await startForeground();
            }
          }
        }, 30_000);
        return;
      }
      if (isNative()) {
        const ok = await startNativeBackground();
        if (!ok) await startForeground();
      } else {
        await startForeground();
      }
    })();

    // Re-evaluate day status when tab becomes visible (catches check-out)
    const onVisibility = () => {
      if (document.visibilityState === "visible") evaluate();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      activeRef.current = false;
      document.removeEventListener("visibilitychange", onVisibility);
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (pollTimer) window.clearInterval(pollTimer);
      if (stopBackground) stopBackground();
    };
  }, [userId]);
}
