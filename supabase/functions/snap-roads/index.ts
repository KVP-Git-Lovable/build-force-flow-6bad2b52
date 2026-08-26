const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

interface LatLng {
  lat: number;
  lng: number;
}

function isValidPoint(p: any): p is LatLng {
  return (
    p &&
    typeof p.lat === "number" &&
    typeof p.lng === "number" &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lng) <= 180
  );
}

function haversineMeters(a: LatLng, b: LatLng) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

/**
 * Snap raw GPS breadcrumbs onto real road geometry using the Google Roads API
 * (`snapToRoads` with interpolate=true) and return the road-following path plus
 * the distance measured ALONG that geometry.
 *
 * This is different from the Routes API (`snap-gps-route`): Routes answers
 * "what is the best path from A to B", which underestimates a real journey with
 * detours and U-turns. snapToRoads answers "which road segments did this trail
 * actually cover", which is what Google Maps Timeline reports.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const GOOGLE_MAPS_API_KEY = Deno.env.get("GOOGLE_MAPS_API_KEY");
    if (!GOOGLE_MAPS_API_KEY) {
      return new Response(JSON.stringify({ error: "Google Maps connector is not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const points: LatLng[] = Array.isArray(body?.points) ? body.points.filter(isValidPoint) : [];
    // Roads API accepts up to 100 points per snapToRoads request.
    if (points.length < 2 || points.length > 100) {
      return new Response(JSON.stringify({ error: "Provide between 2 and 100 valid points" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const path = points.map((p) => `${p.lat},${p.lng}`).join("|");
    const query = `interpolate=true&path=${encodeURIComponent(path)}`;

    const callGateway = () =>
      fetch(`${GATEWAY_URL}/roads/v1/snapToRoads?${query}`, {
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY ?? ""}`,
          "X-Connection-Api-Key": GOOGLE_MAPS_API_KEY,
        },
      });

    const callDirect = () =>
      fetch(`https://roads.googleapis.com/v1/snapToRoads?${query}&key=${GOOGLE_MAPS_API_KEY}`);

    let response = LOVABLE_API_KEY ? await callGateway() : await callDirect();
    for (let attempt = 1; attempt <= 2 && [429, 500, 502, 503, 504].includes(response.status); attempt++) {
      await response.body?.cancel();
      await new Promise((r) => setTimeout(r, attempt * 400));
      response = LOVABLE_API_KEY ? await callGateway() : await callDirect();
    }

    // The connector gateway may not proxy the Roads API — fall back to calling
    // Google directly with the same server key.
    if (!response.ok && LOVABLE_API_KEY) {
      await response.body?.cancel();
      response = await callDirect();
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.error("snapToRoads failed", response.status, text.slice(0, 300));
      return new Response(
        JSON.stringify({ error: "Roads request failed", status: response.status }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const snapped: LatLng[] = (data?.snappedPoints ?? [])
      .map((sp: any) => ({ lat: sp?.location?.latitude, lng: sp?.location?.longitude }))
      .filter(isValidPoint);

    if (snapped.length < 2) {
      return new Response(JSON.stringify({ error: "No road geometry returned" }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let distanceMeters = 0;
    for (let i = 1; i < snapped.length; i++) {
      distanceMeters += haversineMeters(snapped[i - 1], snapped[i]);
    }

    return new Response(JSON.stringify({ path: snapped, distanceMeters }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("snap-roads error", e);
    return new Response(JSON.stringify({ error: "Unexpected error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
