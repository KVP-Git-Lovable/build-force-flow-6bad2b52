import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface ActivityStatusEntry {
  status: string;
  at: string;
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
}

export interface ActivityPhotoEntry {
  url: string;
  at: string;
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
}


export interface Activity {
  id: string;
  user_id: string;
  activity_name: string;
  activity_type: string;
  activity_date: string;
  start_time: string | null;
  end_time: string | null;
  duration_type: string | null;
  from_date: string | null;
  to_date: string | null;
  total_days: number | null;
  total_hours: number | null;
  description: string | null;
  remarks: string | null;
  status: string;
  activity_code: string | null;
  project_id: string | null;
  site_id: string | null;
  milestone_id: string | null;
  grn_po_id: string | null;
  customer_id: string | null;
  opportunity_id: string | null;
  location_lat: number | null;
  location_lng: number | null;
  location_address: string | null;
  status_changed_at: string | null;
  status_change_lat: number | null;
  status_change_lng: number | null;
  attachment_urls: string[];
  status_history: ActivityStatusEntry[];
  photo_urls: ActivityPhotoEntry[];
  created_at: string;
  // joined
  user_full_name?: string;
  project_name?: string;
  site_name?: string;
  site_flag?: string;
  milestone_name?: string;
  milestone_status?: string;
}

export interface ActivityFilters {
  employee: string;
  project: string;
  dateFrom: string;
  dateTo: string;
  status: string;
}

export function useActivities() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<{ id: string; full_name: string }[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [sites, setSites] = useState<{ id: string; site_name: string; is_active: boolean }[]>([]);
  const { toast } = useToast();

  const fetchActivities = useCallback(async (filters?: ActivityFilters) => {
    setLoading(true);
    try {
      let query = supabase
        .from("activity_events")
        .select("*")
        .order("activity_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (filters?.employee) query = query.eq("user_id", filters.employee);
      if (filters?.project) query = query.eq("project_id", filters.project);
      if (filters?.status) query = query.eq("status", filters.status);
      if (filters?.dateFrom) query = query.gte("activity_date", filters.dateFrom);
      if (filters?.dateTo) query = query.lte("activity_date", filters.dateTo);

      const { data, error } = await query;
      if (error) throw error;

      // Fetch user names, project names, and site names
      const userIds = [...new Set((data || []).map((a: any) => a.user_id))];
      const projectIds = [...new Set((data || []).filter((a: any) => a.project_id).map((a: any) => a.project_id))];
      const siteIds = [...new Set((data || []).filter((a: any) => a.site_id).map((a: any) => a.site_id))];

      let userMap: Record<string, string> = {};
      let projectMap: Record<string, string> = {};
      let siteMap: Record<string, { name: string; active: boolean; flag: string }> = {};

      if (userIds.length > 0) {
        const { data: usersData } = await supabase.from("users").select("id, full_name").in("id", userIds);
        (usersData || []).forEach((u: any) => { userMap[u.id] = u.full_name || u.id; });
      }

      if (projectIds.length > 0) {
        const { data: projData } = await supabase.from("pm_projects").select("id, name").in("id", projectIds);
        (projData || []).forEach((p: any) => { projectMap[p.id] = p.name; });
      }

      if (siteIds.length > 0) {
        const { data: siteData } = await supabase.from("project_sites").select("id, site_name, is_active, flag").in("id", siteIds);
        (siteData || []).forEach((s: any) => { siteMap[s.id] = { name: s.site_name, active: s.is_active, flag: s.flag || "green" }; });
      }

      // Fetch milestone names
      const milestoneIds = [...new Set((data || []).filter((a: any) => a.milestone_id).map((a: any) => a.milestone_id))];
      let milestoneMap: Record<string, { name: string; status: string }> = {};
      if (milestoneIds.length > 0) {
        const { data: msData } = await supabase.from("site_milestones").select("id, name, status").in("id", milestoneIds);
        (msData || []).forEach((m: any) => { milestoneMap[m.id] = { name: m.name, status: m.status }; });
      }

      const mapped: Activity[] = (data || []).map((a: any) => {
        const siteInfo = a.site_id ? siteMap[a.site_id] : null;
        const msInfo = a.milestone_id ? milestoneMap[a.milestone_id] : null;
        return {
          ...a,
          attachment_urls: a.attachment_urls || [],
          status_history: Array.isArray(a.status_history) ? a.status_history : [],
          photo_urls: Array.isArray(a.photo_urls) ? a.photo_urls : [],
          user_full_name: userMap[a.user_id] || "",
          project_name: a.project_id ? projectMap[a.project_id] || "" : "",
          site_name: siteInfo ? `${siteInfo.name}${!siteInfo.active ? " (Inactive)" : ""}` : "",
          site_flag: siteInfo?.flag || "",
          milestone_name: msInfo?.name || "",
          milestone_status: msInfo?.status || "",
        };
      });

      setActivities(mapped);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const fetchDropdowns = useCallback(async () => {
    const [usersRes, projRes, sitesRes] = await Promise.all([
      supabase.from("users").select("id, full_name").eq("is_active", true).order("full_name"),
      supabase.from("pm_projects").select("id, name").eq("is_template", false).order("name"),
      supabase.from("project_sites").select("id, site_name, is_active").order("site_name"),
    ]);
    setUsers((usersRes.data || []).map((u: any) => ({ id: u.id, full_name: u.full_name || "" })));
    setProjects((projRes.data || []).map((p: any) => ({ id: p.id, name: p.name })));
    setSites((sitesRes.data || []).map((s: any) => ({ id: s.id, site_name: s.site_name, is_active: s.is_active })));
  }, []);

  const fetchAttendanceForDate = useCallback(async (userId: string, date: string) => {
    const { data } = await supabase
      .from("attendance")
      .select("check_in_time, check_out_time")
      .eq("user_id", userId)
      .eq("date", date)
      .maybeSingle();
    return data;
  }, []);

  const checkInForDate = useCallback(async (userId: string, date: string) => {
    let location: { lat: number; lng: number } | null = null;
    try {
      location = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          () => reject(),
          { enableHighAccuracy: true, timeout: 10000 }
        );
      });
    } catch {
      location = null;
    }

    const now = new Date().toISOString();
    const { data: existing } = await supabase
      .from("attendance")
      .select("id, check_in_time")
      .eq("user_id", userId)
      .eq("date", date)
      .maybeSingle();

    if (existing?.check_in_time) {
      return { check_in_time: existing.check_in_time, check_out_time: null };
    }

    const payload: any = { check_in_time: now, check_in_location: location, status: "present" };
    if (existing) {
      const { error } = await supabase.from("attendance").update(payload).eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("attendance").insert({ user_id: userId, date, ...payload });
      if (error) throw error;
    }
    return { check_in_time: now, check_out_time: null };
  }, []);

  const fetchGPSTrackingForDate = useCallback(async (userId: string, date: string) => {
    const [pointsRes, stopsRes] = await Promise.all([
      supabase
        .from("gps_tracking")
        .select("*")
        .eq("user_id", userId)
        .eq("date", date)
        .order("timestamp", { ascending: true }),
      supabase
        .from("gps_tracking_stops")
        .select("*")
        .eq("user_id", userId)
        .gte("timestamp", `${date}T00:00:00`)
        .lte("timestamp", `${date}T23:59:59`)
    ]);
    return {
      points: pointsRes.data || [],
      stops: stopsRes.data || [],
    };
  }, []);

  const createActivity = useCallback(async (activity: Partial<Activity>, targetUserId?: string, silent?: boolean) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { data, error } = await supabase
      .from("activity_events")
      .insert({
        user_id: targetUserId || user.id,
        activity_name: activity.activity_name!,
        activity_type: activity.activity_type!,
        activity_date: activity.activity_date!,
        start_time: activity.start_time || null,
        end_time: activity.end_time || null,
        duration_type: activity.duration_type || null,
        from_date: activity.from_date || null,
        to_date: activity.to_date || null,
        total_days: activity.total_days || null,
        total_hours: activity.total_hours || 0,
        description: activity.description || null,
        remarks: activity.remarks || null,
        status: activity.status || "planned",
        project_id: activity.project_id || null,
        site_id: activity.site_id || null,
        milestone_id: (activity as any).milestone_id || null,
        grn_po_id: (activity as any).grn_po_id || null,
        location_lat: activity.location_lat || null,
        location_lng: activity.location_lng || null,
        location_address: activity.location_address || null,
        attachment_urls: activity.attachment_urls || [],
        status_history: (activity.status_history as any) || [],
        photo_urls: (activity.photo_urls as any) || [],
      })
      .select("*")
      .single();

    if (error) throw error;
    if (!silent) toast({ title: "Activity Created", description: "Activity logged successfully" });

    return data
      ? ({
          ...data,
          attachment_urls: Array.isArray(data.attachment_urls) ? (data.attachment_urls as string[]) : [],
          status_history: Array.isArray((data as any).status_history) ? (data as any).status_history : [],
          photo_urls: Array.isArray((data as any).photo_urls) ? (data as any).photo_urls : [],
        } as unknown as Activity)
      : null;
  }, [toast]);

  const updateActivity = useCallback(async (id: string, updates: Partial<Activity>) => {
    const updatePayload: any = {};
    const fields = [
      'activity_name', 'activity_type', 'activity_date', 'start_time', 'end_time',
      'duration_type', 'total_hours', 'total_days', 'from_date', 'to_date',
      'description', 'remarks', 'status',
      'project_id', 'site_id', 'milestone_id', 'grn_po_id', 'location_address',
      'status_changed_at', 'status_change_lat', 'status_change_lng',
      'location_lat', 'location_lng', 'attachment_urls',
      'status_history', 'photo_urls',
    ];
    fields.forEach((f) => {
      if ((updates as any)[f] !== undefined) updatePayload[f] = (updates as any)[f];
    });

    const { error } = await supabase
      .from("activity_events")
      .update(updatePayload)
      .eq("id", id);

    if (error) throw error;
    toast({ title: "Activity Updated" });
  }, [toast]);

  const deleteActivity = useCallback(async (id: string) => {
    const { error } = await supabase.from("activity_events").delete().eq("id", id);
    if (error) throw error;
    toast({ title: "Activity Deleted" });
  }, [toast]);

  useEffect(() => {
    fetchActivities();
    fetchDropdowns();
  }, [fetchActivities, fetchDropdowns]);

  return {
    activities,
    loading,
    users,
    projects,
    sites,
    fetchActivities,
    fetchDropdowns,
    createActivity,
    updateActivity,
    deleteActivity,
    fetchAttendanceForDate,
    checkInForDate,
    fetchGPSTrackingForDate,
  };
}
