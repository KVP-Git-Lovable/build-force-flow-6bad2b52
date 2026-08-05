import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "./useCurrentUser";

interface UserProfile {
  id: string;
  full_name: string | null;
  username: string | null;
  profile_picture_url: string | null;
  phone_number: string | null;
}

interface UserProfileState {
  profile: UserProfile | null;
  role: string | null;
  roleName: string | null;
  isAdmin: boolean;
  loading: boolean;
  initials: string;
}

const PROFILE_CACHE_KEY = "user_profile_cache_v1";

function readCache(userId: string | undefined): { profile: UserProfile; role: string } | undefined {
  if (!userId) return undefined;
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    if (parsed?.userId !== userId) return undefined;
    return { profile: parsed.profile, role: parsed.role };
  } catch {
    return undefined;
  }
}

function writeCache(userId: string, profile: UserProfile, role: string) {
  try {
    localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ userId, profile, role }));
  } catch { /* quota */ }
}

export function useUserProfile(): UserProfileState {
  const { user } = useCurrentUser();
  const cached = readCache(user?.id);

  // Primary query — only the data needed for first paint (name, avatar, role flag)
  const { data, isLoading } = useQuery({
    queryKey: ["user-profile-core", user?.id],
    queryFn: async () => {
      if (!user) return null;

      const [rpcRes, profileRes] = await Promise.all([
        supabase.rpc("ensure_current_user", {
          _email: user.email ?? "",
          _full_name: null,
          _username: null,
        }),
        supabase
          .from("profiles")
          .select("id, full_name, username, profile_picture_url, phone_number")
          .eq("id", user.id)
          .single(),
      ]);

      const rpcData = rpcRes.data;
      const profile: UserProfile = profileRes.data ?? {
        id: user.id,
        full_name: rpcData?.[0]?.full_name ?? null,
        username: rpcData?.[0]?.username ?? null,
        profile_picture_url: null,
        phone_number: null,
      };

      const role = rpcData?.[0]?.role ?? "user";
      writeCache(user.id, profile, role);
      return { profile, role };
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    initialData: cached,
  });

  // Secondary query — role display name and admin status (not blocking dashboard render)
  const { data: roleNameData } = useQuery({
    queryKey: ["user-role-name", user?.id],
    queryFn: async () => {
      if (!user) return null;
      try {
        // First try to get role from users table
        const { data: userRow } = await supabase
          .from("users")
          .select("role_id, roles(name)")
          .eq("id", user.id)
          .single();
        const roleName = (userRow as { roles?: { name?: string } | null } | null)?.roles?.name ?? null;

        // Also check security profile for more accurate admin detection
        const { data: secProfile } = await supabase
          .from("user_security_profiles")
          .select("security_profiles(name)")
          .eq("user_id", user.id)
          .maybeSingle();

        const secProfileName = (secProfile as { security_profiles?: { name?: string } | null } | null)?.security_profiles?.name ?? null;

        console.log("Role fetch result:", { userId: user.id, roleName, secProfileName });
        return { roleName, secProfileName };
      } catch (err) {
        console.error("Error fetching role name:", err);
        return { roleName: null, secProfileName: null };
      }
    },
    enabled: !!user,
    staleTime: 30 * 60 * 1000,
  });

  const profile = data?.profile ?? null;
  const role = data?.role ?? null;
  const roleName = roleNameData?.roleName ?? null;
  const secProfileName = roleNameData?.secProfileName ?? null;

  const displayName = profile?.full_name || profile?.username || "";
  const initials = displayName
    ? displayName
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "??";

  // Check admin status from multiple sources:
  // 1. Primary role from RPC (legacy system)
  // 2. Role name from users.role_id
  // 3. Security profile name
  const isAdmin =
    role === "admin" ||
    roleName === "Admin" ||
    secProfileName === "System Administrator";

  console.log("User profile state:", {
    userId: user?.id,
    role,
    roleName,
    secProfileName,
    isAdmin,
    loading: isLoading
  });

  return {
    profile,
    role,
    roleName,
    isAdmin,
    loading: isLoading,
    initials,
  };
}
