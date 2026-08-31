import { useEffect, useState } from "react";
import { MapPin, CheckCircle2, AlertTriangle, XCircle, Loader2 } from "lucide-react";
import type { Activity as ActivityType } from "@/hooks/useActivities";

type Coords = { lat: number; lng: number };

const CACHE_PREFIX = "geocode:v1:";

function haversineKm(a: Coords, b: Coords) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

async function geocode(address: string): Promise<Coords | null> {
  const key = CACHE_PREFIX + address.trim().toLowerCase();
  try {
    const cached = localStorage.getItem(key);
    if (cached) {
      const parsed = JSON.parse(cached);
      return parsed && typeof parsed.lat === "number" ? parsed : null;
    }
  } catch { /* ignore */ }
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`
    );
    const json = await res.json();
    const hit = Array.isArray(json) && json[0];
    const coords = hit ? { lat: Number(hit.lat), lng: Number(hit.lon) } : null;
    try { localStorage.setItem(key, JSON.stringify(coords)); } catch { /* ignore */ }
    return coords;
  } catch {
    return null;
  }
}

interface Props {
  activity: ActivityType;
  className?: string;
}

export default function ActivityGeoStamp({ activity, className }: Props) {
  const leadAddress = (activity as any).lead_address as string | undefined;
  const lat = activity.location_lat ?? activity.status_change_lat;
  const lng = activity.location_lng ?? activity.status_change_lng;
  const hasVisited = !!(lat && lng) || !!activity.location_address;

  const [leadCoords, setLeadCoords] = useState<Coords | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!leadAddress || !lat || !lng) { setLeadCoords(null); return; }
    setChecking(true);
    geocode(leadAddress).then((c) => {
      if (!alive) return;
      setLeadCoords(c);
      setChecking(false);
    });
    return () => { alive = false; };
  }, [leadAddress, lat, lng]);

  if (!leadAddress && !hasVisited) return null;

  const distanceKm =
    leadCoords && lat && lng ? haversineKm(leadCoords, { lat: Number(lat), lng: Number(lng) }) : null;

  let match: { icon: JSX.Element; label: string; cls: string } | null = null;
  if (distanceKm !== null) {
    if (distanceKm <= 0.5) {
      match = {
        icon: <CheckCircle2 className="h-3.5 w-3.5" />,
        label: `Match (${Math.round(distanceKm * 1000)} m)`,
        cls: "bg-emerald-50 text-emerald-700 border-emerald-200",
      };
    } else if (distanceKm <= 1) {
      match = {
        icon: <AlertTriangle className="h-3.5 w-3.5" />,
        label: `Partial Match (${Math.round(distanceKm * 1000)} m)`,
        cls: "bg-amber-50 text-amber-700 border-amber-200",
      };
    } else {
      match = {
        icon: <XCircle className="h-3.5 w-3.5" />,
        label: `Not Matching (${distanceKm.toFixed(1)} km)`,
        cls: "bg-red-50 text-red-700 border-red-200",
      };
    }
  }

  const mapsUrl = lat && lng ? `https://www.google.com/maps?q=${lat},${lng}` : null;

  return (
    <div className={`rounded-lg border p-3 space-y-2 ${className || ""}`}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs font-semibold flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5" /> Geo Stamp
        </p>
        {checking ? (
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Verifying
          </span>
        ) : match ? (
          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${match.cls}`}>
            {match.icon}
            <span>{match.label}</span>
          </span>
        ) : leadAddress && lat && lng ? (
          <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium bg-amber-50 text-amber-700 border-amber-200">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>Not verifiable</span>
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-md bg-muted/40 p-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Address in Lead</p>
          <p className="text-xs text-foreground/90 break-words mt-0.5">
            {leadAddress || "No address on the lead record"}
          </p>
        </div>
        <div className="rounded-md bg-muted/40 p-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Visited Address</p>
          {mapsUrl ? (
            <button
              type="button"
              className="text-xs text-sky-600 dark:text-sky-400 underline underline-offset-2 text-left break-words mt-0.5"
              onClick={(e) => { e.stopPropagation(); window.open(mapsUrl, "_blank", "noopener,noreferrer"); }}
            >
              {activity.location_address || "View location"}
            </button>
          ) : (
            <p className="text-xs text-foreground/90 break-words mt-0.5">
              {activity.location_address || "Not captured"}
            </p>
          )}
          {lat && lng && (
            <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
              {Number(lat).toFixed(5)}, {Number(lng).toFixed(5)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
