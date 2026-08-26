import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  CalendarDays,
  ChevronLeft,
  Clock,
  LogIn,
  LogOut,
  Activity,
  MapPin,
  Download,
  Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useActivities, type Activity as ActivityType } from "@/hooks/useActivities";
import { useUserProfile } from "@/hooks/useUserProfile";
import jsPDF from "jspdf";
import { toast } from "sonner";
import { downloadPDF as downloadPDFNative } from "@/utils/nativeDownload";

const statusColors: Record<string, string> = {
  planned: "bg-muted text-muted-foreground",
  in_progress: "bg-info/10 text-info border-info/20",
  completed: "bg-success/10 text-success border-success/20",
};
const statusLabels: Record<string, string> = {
  planned: "Planned",
  in_progress: "In Progress",
  completed: "Completed",
};

export default function ActivityTimeline() {
  const navigate = useNavigate();
  const { activities, loading, fetchAttendanceForDate } = useActivities();
  const { isAdmin } = useUserProfile();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [currentUserId, setCurrentUserId] = useState("");
  const [attendance, setAttendance] = useState<{ check_in_time: string | null; check_out_time: string | null } | null>(null);
  const [attendanceLoading, setAttendanceLoading] = useState(false);

  const dateStr = format(selectedDate, "yyyy-MM-dd");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setCurrentUserId(data.user.id);
    });
  }, []);

  useEffect(() => {
    if (!currentUserId) return;
    setAttendanceLoading(true);
    fetchAttendanceForDate(currentUserId, dateStr).then((data) => {
      setAttendance(data);
      setAttendanceLoading(false);
    });
  }, [currentUserId, dateStr, fetchAttendanceForDate]);

  const dayActivities = useMemo(() => {
    return activities
      .filter((a) => a.activity_date === dateStr)
      .sort((a, b) => {
        if (!a.start_time && !b.start_time) return 0;
        if (!a.start_time) return 1;
        if (!b.start_time) return -1;
        return new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
      });
  }, [activities, dateStr]);

  const handleDownloadPDF = useCallback(async () => {
    try {
      const doc = new jsPDF();
      const title = `Timeline - ${format(selectedDate, "MMM dd, yyyy")}`;
      doc.setFontSize(16);
      doc.text(title, 14, 20);

      let y = 35;
      if (attendance?.check_in_time) {
        doc.setFontSize(11);
        doc.setTextColor(34, 139, 34);
        doc.text(`DAY START - ${format(parseISO(attendance.check_in_time), "h:mm a")}`, 14, y);
        y += 10;
      }

      doc.setTextColor(0, 0, 0);
      dayActivities.forEach((a) => {
        if (y > 270) { doc.addPage(); y = 20; }
        doc.setFontSize(10);
        const time = a.start_time ? format(parseISO(a.start_time), "h:mm a") : "--:--";
        doc.text(`${time} - ${a.activity_name} (${statusLabels[a.status] || a.status})`, 14, y);
        y += 6;
        if (a.description) {
          doc.setFontSize(8);
          doc.setTextColor(100);
          doc.text(a.description.substring(0, 80), 20, y);
          doc.setTextColor(0, 0, 0);
          y += 6;
        }
        y += 2;
      });

      if (attendance?.check_out_time) {
        if (y > 270) { doc.addPage(); y = 20; }
        doc.setFontSize(11);
        doc.setTextColor(200, 0, 0);
        doc.text(`DAY END - ${format(parseISO(attendance.check_out_time), "h:mm a")}`, 14, y);
      }

      await downloadPDFNative(doc, `timeline-${dateStr}.pdf`);
    } catch (err) {
      console.error('PDF download error:', err);
      toast.error('Failed to download PDF');
    }
  }, [selectedDate, attendance, dayActivities, dateStr]);

  const isLoading = loading || attendanceLoading;
  const hasCheckIn = attendance?.check_in_time;
  const hasCheckOut = attendance?.check_out_time;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-background border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/activities")}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-base font-semibold flex-1">
            Timeline View - {format(selectedDate, "MMM dd, yyyy")}
          </h1>
        </div>
      </div>

      {/* Timeline Header + Controls */}
      <div className="px-4 pt-4">
        <div className="mb-4 space-y-3">
          <div>
            <h2 className="text-xl font-extrabold tracking-tight">TIMELINE</h2>
            <div className="h-1 w-16 bg-foreground rounded-full mt-1" />
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="gap-2 text-xs flex-1 min-w-0 justify-start">
                  <CalendarDays className="h-4 w-4 shrink-0" />
                  <span className="truncate">{format(selectedDate, "MMM d, yyyy")}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(d) => d && setSelectedDate(d)}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            <Button variant="outline" size="icon" className="shrink-0" onClick={handleDownloadPDF} aria-label="Download PDF">
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>


      {/* Timeline Content */}
      <div className="px-4 pb-24">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-[18px] top-0 bottom-0 w-0.5 bg-foreground/20" />

            {/* Day Start */}
            {hasCheckIn && (
              <div className="flex gap-4 mb-6 relative">
                <div className="z-10 shrink-0">
                  <div className="w-9 h-9 rounded-full bg-emerald-500 flex items-center justify-center">
                    <LogIn className="h-4 w-4 text-white" />
                  </div>
                </div>
                <div className="pt-1">
                  <p className="text-base font-bold">DAY START</p>
                  <p className="text-sm text-muted-foreground">
                    {format(parseISO(attendance!.check_in_time!), "hh:mm a")}
                  </p>
                </div>
              </div>
            )}

            {/* No check-in, no activities */}
            {!hasCheckIn && dayActivities.length === 0 && (
              <div className="text-center py-12">
                <Clock className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
                <p className="text-muted-foreground font-medium">No activities recorded for this date.</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Activities will appear here once you place orders or record no-order reasons.
                </p>
              </div>
            )}

            {/* Activity nodes */}
            {dayActivities.map((a) => (
              <div key={a.id} className="flex gap-4 mb-5 relative">
                <div className="z-10 shrink-0">
                  <div className="w-9 h-9 rounded-full bg-primary/15 border-2 border-primary/30 flex items-center justify-center">
                    <Activity className="h-4 w-4 text-primary" />
                  </div>
                </div>
                <div className="flex-1 pt-0.5">
                  <Card className="shadow-sm">
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-sm">{a.activity_name}</span>
                        <Badge variant="outline" className={`text-[10px] py-0 ${statusColors[a.status]}`}>
                          {statusLabels[a.status] || a.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {a.start_time ? format(parseISO(a.start_time), "h:mm a") : "--:--"}
                        {a.end_time && ` - ${format(parseISO(a.end_time), "h:mm a")}`}
                      </p>
                      {a.site_name && (
                        <p className="text-xs text-muted-foreground mt-0.5">📁 {a.site_name}</p>
                      )}
                      {a.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.description}</p>
                      )}
                      {isAdmin && a.user_full_name && (
                        <p className="text-xs text-muted-foreground mt-0.5">👤 {a.user_full_name}</p>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            ))}

            {/* Day End */}
            {hasCheckOut && (
              <div className="flex gap-4 mb-6 relative">
                <div className="z-10 shrink-0">
                  <div className="w-9 h-9 rounded-full bg-red-500 flex items-center justify-center">
                    <LogOut className="h-4 w-4 text-white" />
                  </div>
                </div>
                <div className="pt-1">
                  <p className="text-base font-bold">DAY END</p>
                  <p className="text-sm text-muted-foreground">
                    {format(parseISO(attendance!.check_out_time!), "hh:mm a")}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
