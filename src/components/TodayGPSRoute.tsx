import { useState, useEffect, Suspense, lazy } from "react";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Navigation, MapPin, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const LeafletMap = lazy(() => import("@/components/LeafletMap"));

interface GPSPoint {
  latitude: number;
  longitude: number;
  timestamp: string;
  speed: number | null;
  accuracy: number | null;
}

interface TodayGPSRouteProps {
  userId: string | undefined;
  checkInTime: string | null;
  checkOutTime: string | null;
}

const MapFallback = () => (
  <div className="h-full w-full flex items-center justify-center bg-muted">
    <p className="text-sm text-muted-foreground">Loading map...</p>
  </div>
);

export default function TodayGPSRoute({ userId, checkInTime, checkOutTime }: TodayGPSRouteProps) {
  const [gpsPoints, setGpsPoints] = useState<GPSPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalDistance, setTotalDistance] = useState(0);

  useEffect(() => {
    if (!userId || !checkInTime) return;

    const fetchTodayGPS = async () => {
      setLoading(true);
      try {
        const today = format(new Date(), "yyyy-MM-dd");
        const { data } = await supabase
          .from("gps_tracking")
          .select("latitude, longitude, timestamp, speed, accuracy")
          .eq("user_id", userId)
          .eq("date", today)
          .or("accuracy.is.null,accuracy.lte.100")
          .order("timestamp", { ascending: true });

        if (data) {
          setGpsPoints(data);

          // Calculate total distance using Haversine formula
          if (data.length > 1) {
            let distance = 0;
            for (let i = 1; i < data.length; i++) {
              const prev = data[i - 1];
              const curr = data[i];
              const R = 6371;
              const dLat = ((curr.latitude - prev.latitude) * Math.PI) / 180;
              const dLon = ((curr.longitude - prev.longitude) * Math.PI) / 180;
              const a =
                Math.sin(dLat / 2) ** 2 +
                Math.cos((prev.latitude * Math.PI) / 180) *
                  Math.cos((curr.latitude * Math.PI) / 180) *
                  Math.sin(dLon / 2) ** 2;
              distance += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            }
            setTotalDistance(distance);
          }
        }
      } catch (err) {
        console.error("Error fetching GPS data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchTodayGPS();
  }, [userId, checkInTime]);

  if (!checkInTime) {
    return null;
  }

  return (
    <motion.div
      className="space-y-4"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div>
        <h2 className="text-lg font-bold">Today's Route</h2>
        <p className="text-sm text-muted-foreground">GPS tracking from check-in to check-out</p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-2">
        <Card className="shadow-card">
          <CardContent className="p-3 text-center">
            <Navigation className="h-4 w-4 mx-auto mb-1 text-primary" />
            <p className="text-xs text-muted-foreground">Distance</p>
            <p className="text-sm font-semibold">{totalDistance.toFixed(2)} km</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-3 text-center">
            <MapPin className="h-4 w-4 mx-auto mb-1 text-primary" />
            <p className="text-xs text-muted-foreground">Points</p>
            <p className="text-sm font-semibold">{gpsPoints.length}</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-3 text-center">
            <Clock className="h-4 w-4 mx-auto mb-1 text-primary" />
            <p className="text-xs text-muted-foreground">Duration</p>
            <p className="text-sm font-semibold">
              {checkOutTime
                ? Math.round(
                    (new Date(checkOutTime).getTime() - new Date(checkInTime).getTime()) /
                      (1000 * 60)
                  ) + " min"
                : "Active"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Timeline */}
      <Card className="shadow-card">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <div>
              <p className="text-muted-foreground">Start</p>
              <p className="font-medium">{format(new Date(checkInTime), "hh:mm a")}</p>
            </div>
            <div className="flex-1 mx-3 border-t border-dashed border-muted-foreground/30" />
            <div className="text-right">
              <p className="text-muted-foreground">{checkOutTime ? "End" : "Current"}</p>
              <p className="font-medium">
                {checkOutTime ? format(new Date(checkOutTime), "hh:mm a") : "Active"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Map */}
      {gpsPoints.length > 0 && (
        <Card className="shadow-card overflow-hidden">
          <CardContent className="p-0">
            <div className="h-[400px] relative">
              {loading ? (
                <MapFallback />
              ) : (
                <Suspense fallback={<MapFallback />}>
                  <LeafletMap gpsPoints={gpsPoints} />
                </Suspense>
              )}
              {totalDistance > 0 && (
                <div className="absolute top-2 right-2 z-[400] bg-primary text-primary-foreground text-xs font-semibold px-3 py-1.5 rounded-full shadow-md">
                  Traveled: {totalDistance.toFixed(2)} km
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {gpsPoints.length === 0 && !loading && (
        <Card className="shadow-card overflow-hidden">
          <CardContent className="p-8 text-center">
            <MapPin className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
            <p className="text-sm font-semibold text-muted-foreground">No GPS data yet</p>
            <p className="text-xs text-muted-foreground mt-1">GPS tracking will appear here after you check in</p>
          </CardContent>
        </Card>
      )}
    </motion.div>
  );
}
