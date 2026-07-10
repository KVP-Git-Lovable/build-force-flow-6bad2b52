import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

const CACHE_KEY = "dashboard_cache_v1";

function getCachedDashboard() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function setCachedDashboard(data: any) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
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

  // Secondary: single RPC call for all aggregate stats
  const cached = getCachedDashboard();
  const summaryQuery = useQuery({
    queryKey: ["dashboard-summary", userId, "v2"],
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase.rpc("get_dashboard_summary");
      if (error) throw error;
      const result = data as unknown as DashboardSummary;
      setCachedDashboard(result);
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
