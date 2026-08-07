import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Branding {
  company_name: string | null;
  logo_url: string | null;
}

const CACHE_KEY = "company_branding_cache_v1";

function readCache(): Branding | undefined {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Branding) : undefined;
  } catch {
    return undefined;
  }
}

function writeCache(b: Branding) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(b));
  } catch {
    /* quota */
  }
}

/**
 * Company branding (name + logo) shared by the app header and the login page.
 * Uses a localStorage cache for instant first paint, then refreshes from the
 * backend so a changed name/logo never stays stale.
 */
export function useBranding() {
  const cached = readCache();

  const { data, isLoading } = useQuery({
    queryKey: ["company-profile-public"],
    queryFn: async () => {
      const { data } = await supabase
        .from("company_profile")
        .select("company_name, logo_url")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const branding: Branding = {
        company_name: data?.company_name ?? null,
        logo_url: data?.logo_url ?? null,
      };
      writeCache(branding);
      return branding;
    },
    initialData: cached,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const rawLogo = data?.logo_url ?? null;
  const [logoUrl, setLogoUrl] = useState<string | null>(rawLogo);

  // Logos stored in the private employee-photos bucket need a signed URL.
  useEffect(() => {
    let active = true;
    if (!rawLogo) {
      setLogoUrl(null);
      return;
    }
    if (!rawLogo.includes("/employee-photos/")) {
      setLogoUrl(rawLogo);
      return;
    }
    resolveSignedUrl("employee-photos", rawLogo).then((u) => {
      if (active) setLogoUrl(u || null);
    });
    return () => {
      active = false;
    };
  }, [rawLogo]);

  return {
    companyName: data?.company_name ?? null,
    logoUrl,
    loading: isLoading && !cached,
  };
}
