import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type ContactRole = "decision_maker" | "influencer" | "end_user" | "unknown";

export const CONTACT_ROLE_LABELS: Record<ContactRole, string> = {
  decision_maker: "Decision Maker",
  influencer: "Influencer",
  end_user: "End User",
  unknown: "Unknown",
};

export interface ScoringRules {
  statusScores: Record<string, number>; // keyed by status name (lowercased)
  contactRoleScores: Record<ContactRole, number>;
  activityThresholds: { min: number; score: number }[]; // sorted desc by min
  ageBuckets: { maxDays: number; score: number }[]; // sorted asc by maxDays
  qualification: { high: number; medium: number };
}

export const DEFAULT_SCORING_RULES: ScoringRules = {
  statusScores: {
    new: 0,
    contacted: 5,
    qualified: 10,
    "proposal sent": 12,
    negotiation: 15,
    converted: 20,
    lost: 0,
  },
  contactRoleScores: { decision_maker: 10, influencer: 5, end_user: 2, unknown: 0 },
  activityThresholds: [
    { min: 3, score: 10 },
    { min: 1, score: 5 },
    { min: 0, score: 0 },
  ],
  ageBuckets: [
    { maxDays: 7, score: 10 },
    { maxDays: 30, score: 5 },
    { maxDays: 999999, score: 2 },
  ],
  qualification: { high: 30, medium: 15 },
};

const MODULE = "lead_scoring";
const KEY = "rules";

export function useLeadScoringRules() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["lead-scoring-rules"],
    queryFn: async (): Promise<ScoringRules> => {
      const { data, error } = await supabase
        .from("app_configuration" as any)
        .select("config_value")
        .eq("module", MODULE)
        .eq("config_key", KEY)
        .maybeSingle();
      if (error) throw error;
      if (!data) return DEFAULT_SCORING_RULES;
      return { ...DEFAULT_SCORING_RULES, ...((data as any).config_value ?? {}) } as ScoringRules;
    },
    staleTime: 60_000,
  });

  const save = useMutation({
    mutationFn: async (rules: ScoringRules) => {
      const { error } = await supabase.from("app_configuration" as any).upsert(
        { module: MODULE, config_key: KEY, config_value: rules as any, updated_at: new Date().toISOString() },
        { onConflict: "module,config_key" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead-scoring-rules"] });
      toast.success("Scoring rules saved");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return { rules: data ?? DEFAULT_SCORING_RULES, isLoading, save: save.mutate, saving: save.isPending };
}

export function activityScore(count: number, rules: ScoringRules): number {
  const sorted = [...rules.activityThresholds].sort((a, b) => b.min - a.min);
  for (const t of sorted) if (count >= t.min) return t.score;
  return 0;
}

export function ageScore(days: number, rules: ScoringRules): number {
  const sorted = [...rules.ageBuckets].sort((a, b) => a.maxDays - b.maxDays);
  for (const b of sorted) if (days <= b.maxDays) return b.score;
  return 0;
}

export function statusScore(statusName: string | undefined | null, rules: ScoringRules): number {
  if (!statusName) return 0;
  return rules.statusScores[statusName.toLowerCase()] ?? 0;
}

export function qualificationLevel(total: number, rules: ScoringRules): "High" | "Medium" | "Low" {
  if (total >= rules.qualification.high) return "High";
  if (total >= rules.qualification.medium) return "Medium";
  return "Low";
}

export function useLeadActivityCount(leadId?: string) {
  return useQuery({
    queryKey: ["lead-activity-count", leadId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("customer_activities" as any)
        .select("*", { count: "exact", head: true })
        .eq("lead_id", leadId!);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!leadId,
  });
}

export function useLeadFirstActivityDate(leadId?: string) {
  return useQuery({
    queryKey: ["lead-first-activity", leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_activities" as any)
        .select("activity_date, created_at")
        .eq("lead_id", leadId!)
        .order("activity_date", { ascending: true })
        .limit(1);
      if (error) throw error;
      const row = (data ?? [])[0] as any;
      return row?.activity_date || row?.created_at || null;
    },
    enabled: !!leadId,
  });
}
