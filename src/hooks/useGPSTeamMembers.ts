import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface TeamMember {
  id: string;
  full_name: string;
}

export function useGPSTeamMembers() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      setCurrentUserId(user.id);

      // A user may hold more than one role — never use .single() here.
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      const admin = (roleData || []).some((r: any) => r.role === "admin");
      if (!cancelled) setIsAdmin(admin);

      const byId = new Map<string, TeamMember>();

      // Everyone the viewer is allowed to see (RLS already scopes this to
      // admins → all users, managers → their reporting tree).
      const { data: visible } = await supabase
        .from("users")
        .select("id, full_name")
        .eq("is_active", true)
        .order("full_name");
      (visible || []).forEach((u: any) => byId.set(u.id, { id: u.id, full_name: u.full_name || u.id }));

      // Union with the explicit hierarchy so indirect reports are never missed.
      const { data: subs } = await supabase.rpc("get_user_hierarchy", { _manager_id: user.id });
      const missingIds = (subs || []).map((s: any) => s.user_id).filter((id: string) => !byId.has(id));
      if (missingIds.length > 0) {
        const { data } = await supabase
          .from("users")
          .select("id, full_name")
          .in("id", missingIds)
          .eq("is_active", true);
        (data || []).forEach((u: any) => byId.set(u.id, { id: u.id, full_name: u.full_name || u.id }));
      }

      if (!cancelled) {
        setTeamMembers(
          Array.from(byId.values()).sort((a, b) => a.full_name.localeCompare(b.full_name))
        );
        setLoading(false);
      }
    };

    init();
    return () => { cancelled = true; };
  }, []);

  return { currentUserId, isAdmin, teamMembers, loading };
}
