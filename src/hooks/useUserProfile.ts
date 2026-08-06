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
  displayRole: string | null;
}

const PROFILE_CACHE_KEY = "user_profile_cache_v2";

const ADMIN_PROFILE_NAMES = ["administrator", "system administrator"];

function isAdminProfileName(name?: string | null): boolean {
  return !!name && ADMIN_PROFILE_NAMES.includes(name.trim().toLowerCase());
}

function isAdminRoleName(name?: string | null): boolean {
  return !!name && ["admin", "administrator"].includes(name.trim().toLowerCase());
}

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

      try {
        // Fetch profile and all role-related data
        const [profileRes, userRes, secProfileRes] = await Promise.all([
          supabase
            .from("profiles")
            .select("id, full_name, username, profile_picture_url, phone_number")
            .eq("id", user.id)
            .single(),
          supabase
            .from("users")
            .select("role_id, roles(name)")
            .eq("id", user.id)
            .single(),
          supabase
            .from("user_security_profiles")
            .select("security_profiles(name)")
            .eq("user_id", user.id)
            .maybeSingle(),
        ]);

        const profile: UserProfile = profileRes.data ?? {
          id: user.id,
          full_name: null,
          username: null,
          profile_picture_url: null,
          phone_number: null,
        };

        // Determine role - check multiple sources
        let role = "user";
        let displayRole: string | null = null;
        const roleData = userRes.data as { roles?: { name?: string } | null } | null;
        const secProfileData = secProfileRes.data as { security_profiles?: { name?: string } | null } | null;

        // Get display role from roles table
        displayRole = roleData?.roles?.name ?? null;

        // Check if user is admin through any method
        if (
          isAdminRoleName(roleData?.roles?.name) ||
          isAdminProfileName(secProfileData?.security_profiles?.name)
        ) {
          role = "admin";
        }

        writeCache(user.id, profile, role);
        if (import.meta.env.DEV) {
          console.log("User profile loaded:", {
            userId: user.id,
            role,
            displayRole,
            roleName: roleData?.roles?.name,
            secProfileName: secProfileData?.security_profiles?.name,
          });
        }
        return { profile, role, displayRole };
      } catch (err) {
        console.error("Error loading user profile:", err);
        return { profile: { id: user.id, full_name: null, username: null, profile_picture_url: null, phone_number: null }, role: "user", displayRole: null as string | null };
      }
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    initialData: cached,
  });

  // Secondary query — check security profile for additional admin detection
  const { data: roleNameData } = useQuery({
    queryKey: ["user-role-name", user?.id],
    queryFn: async () => {
      if (!user) return null;
      try {
        // Check security profile for more accurate admin detection
        const { data: secProfile } = await supabase
          .from("user_security_profiles")
          .select("security_profiles(name)")
          .eq("user_id", user.id)
          .maybeSingle();

        const secProfileName = (secProfile as { security_profiles?: { name?: string } | null } | null)?.security_profiles?.name ?? null;
        if (import.meta.env.DEV) {
          console.log("Security profile lookup:", { userId: user.id, secProfileName });
        }
        return { secProfileName };
      } catch (err) {
        console.error("Error fetching security profile:", err);
        return { secProfileName: null };
      }
    },
    enabled: !!user,
    staleTime: 30 * 60 * 1000,
  });

  const profile = data?.profile ?? null;
  const role = data?.role ?? null;
  const displayRole = data?.displayRole ?? null;
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
  // 1. Primary role from users.role_id (direct check for "admin")
  // 2. Security profile name as fallback
  const isAdmin = role === "admin" || isAdminProfileName(secProfileName);

  if (import.meta.env.DEV) {
    console.log("User profile state:", {
      userId: user?.id,
      role,
      displayRole,
      secProfileName,
      isAdmin,
      loading: isLoading
    });
  }

  return {
    profile,
    role,
    roleName: displayRole,
    isAdmin,
    loading: isLoading,
    initials,
    displayRole,
  };
}
