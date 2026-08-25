import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

const CACHE_PREFIX = "dashboard_cache_v2";

function cacheKeyFor(userId: string, date: string) {
  return `${CACHE_PREFIX}_${userId}_${date}`;
}

/** Remove every stale dashboard cache entry (other users / other dates). */
function sweepStaleCaches(keepKey: string) {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(CACHE_PREFIX) && k !== keepKey)
      .forEach((k) => localStorage.removeItem(k));
    // Remove the legacy unscoped cache from older builds
    localStorage.removeItem("dashboard_cache_v1");
  } catch { /* ignore */ }
}

function getCachedDashboard(userId: string, date: string) {
  try {
    const key = cacheKeyFor(userId, date);
    sweepStaleCaches(key);
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function setCachedDashboard(userId: string, date: string, data: any) {
  try {
    localStorage.setItem(cacheKeyFor(userId, date), JSON.stringify(data));
  } catch { /* quota exceeded */ }
}

interface DashboardSummary {
  pending_leaves: number;
  activities_total: number;
  activities_completed: number;
  activities_in_progress: number;
  today_activities: number;
  pending_expenses_count: number;
  pending_expenses_total: number;
}

export function useDashboard(userId: string | undefined) {
  const today = format(new Date(), "yyyy-MM-dd");

  // Core: just today's attendance (needed for first paint banner)
  const attendanceQuery = useQuery({
    queryKey: ["dashboard-attendance", userId, today],
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from("attendance")
        .select("*")
        .eq("user_id", userId)
        .eq("date", today)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  // Secondary: single RPC call for all aggregate stats.
  // Cache is scoped to user + date so a reload never shows yesterday's
  // (or another user's) numbers.
  const cached = userId ? getCachedDashboard(userId, today) : null;
  const summaryQuery = useQuery({
    queryKey: ["dashboard-summary", userId, today, "v3"],
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase.rpc("get_dashboard_summary");
      if (error) throw error;
      const result = data as unknown as DashboardSummary;
      setCachedDashboard(userId, today, result);
      return result;
    },
    enabled: !!userId,
    placeholderData: cached as DashboardSummary | undefined,
    staleTime: 30 * 1000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const summary = summaryQuery.data;

  const attendance = attendanceQuery.data;
  const isCheckedIn = !!attendance?.check_in_time && !attendance?.check_out_time;
  const isCheckedOut = !!attendance?.check_out_time;
  const dayStarted = !!attendance?.check_in_time;

  return {
    attendance,
    isLoading: attendanceQuery.isLoading,
    isSummaryLoading: summaryQuery.isLoading && !cached,
    dayStarted,
    isCheckedIn,
    isCheckedOut,
    pendingLeaves: summary?.pending_leaves ?? 0,
    leaveBalances: [],
    myActivities: {
      total: summary?.activities_total ?? 0,
      completed: summary?.activities_completed ?? 0,
      inProgress: summary?.activities_in_progress ?? 0,
    },
    pendingExpenses: {
      count: summary?.pending_expenses_count ?? 0,
      total: summary?.pending_expenses_total ?? 0,
    },
    todayActivities: summary?.today_activities ?? 0,
  };
}
