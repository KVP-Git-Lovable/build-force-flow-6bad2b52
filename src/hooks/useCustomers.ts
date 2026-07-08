import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface Customer {
  id: string;
  name: string;
  industry: string | null;
  status: string;
  owner_id: string | null;
  primary_contact_id: string | null;
  created_at: string;
  updated_at: string;
}

// ---------- Customers ----------
export function useCustomers() {
  return useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").order("name");
      if (error) throw error;
      return data as Customer[];
    },
  });
}

export function useCustomer(id?: string) {
  return useQuery({
    queryKey: ["customer", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").eq("id", id!).single();
      if (error) throw error;
      return data as Customer;
    },
    enabled: !!id,
  });
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: Partial<Customer>) => {
      const { data, error } = await supabase.from("customers").insert(v as any).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["customers"] }); toast.success("Customer created"); },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...v }: Partial<Customer> & { id: string }) => {
      const { data, error } = await supabase.from("customers").update(v).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (d: any) => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["customer", d.id] });
    },
    onError: (e: any) => toast.error(e.message),
  });
}


export interface Opportunity {
  id: string;
  customer_id: string | null;
  name: string;
  type: string | null;
  stage: string | null;
  probability: number;
  close_date: string | null;
  amount: number;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  customer_id: string | null;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  reports_to_id: string | null;
  last_contact_at: string | null;
  created_at: string;
}

export interface Milestone {
  id: string;
  opportunity_id: string;
  name: string;
  invoice_number: string | null;
  invoice_date: string | null;
  invoice_value: number;
  status: string;
  created_at: string;
}

export interface CustomerActivity {
  id: string;
  customer_id: string | null;
  opportunity_id: string | null;
  type: string;
  subject: string;
  notes: string | null;
  activity_date: string;
  created_by: string | null;
  created_at: string;
}

export interface CustomerDocument {
  id: string;
  customer_id: string | null;
  opportunity_id: string | null;
  file_name: string;
  file_url: string;
  file_size: number | null;
  file_type: string | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface OppType { id: string; name: string; sort_order: number; is_active: boolean }
export interface OppStage {
  id: string; name: string; color: string; sort_order: number;
  is_won: boolean; is_closed: boolean; is_active: boolean;
}

// ---------- Opportunities ----------
export function useOpportunities() {
  return useQuery({
    queryKey: ["opportunities"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customer_opportunities").select("*").order("updated_at", { ascending: false });
      if (error) throw error;
      return data as Opportunity[];
    },
  });
}

export function useOpportunity(id?: string) {
  return useQuery({
    queryKey: ["opportunity", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("customer_opportunities").select("*").eq("id", id!).single();
      if (error) throw error;
      return data as Opportunity;
    },
    enabled: !!id,
  });
}

export function useCreateOpportunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: Partial<Opportunity>) => {
      const { data, error } = await supabase.from("customer_opportunities").insert(v as any).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["opportunities"] }); toast.success("Opportunity created"); },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateOpportunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...v }: Partial<Opportunity> & { id: string }) => {
      const { data, error } = await supabase.from("customer_opportunities").update(v).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (d: any) => {
      qc.invalidateQueries({ queryKey: ["opportunities"] });
      qc.invalidateQueries({ queryKey: ["opportunity", d.id] });
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteOpportunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("customer_opportunities").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["opportunities"] }); toast.success("Deleted"); },
    onError: (e: any) => toast.error(e.message),
  });
}

// ---------- Milestones ----------
export function useMilestones(oppId?: string) {
  return useQuery({
    queryKey: ["milestones", oppId],
    queryFn: async () => {
      const { data, error } = await supabase.from("opportunity_milestones").select("*")
        .eq("opportunity_id", oppId!).order("created_at");
      if (error) throw error;
      return data as Milestone[];
    },
    enabled: !!oppId,
  });
}

export function useCreateMilestone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: Partial<Milestone>) => {
      const { data, error } = await supabase.from("opportunity_milestones").insert(v as any).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (d: any) => { qc.invalidateQueries({ queryKey: ["milestones", d.opportunity_id] }); toast.success("Milestone added"); },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateMilestone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...v }: Partial<Milestone> & { id: string }) => {
      const { data, error } = await supabase.from("opportunity_milestones").update(v).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (d: any) => qc.invalidateQueries({ queryKey: ["milestones", d.opportunity_id] }),
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteMilestone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, oppId }: { id: string; oppId: string }) => {
      const { error } = await supabase.from("opportunity_milestones").delete().eq("id", id);
      if (error) throw error;
      return oppId;
    },
    onSuccess: (oppId) => qc.invalidateQueries({ queryKey: ["milestones", oppId] }),
    onError: (e: any) => toast.error(e.message),
  });
}

// ---------- Contacts ----------
export function useContacts() {
  return useQuery({
    queryKey: ["contacts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customer_contacts").select("*").order("name");
      if (error) throw error;
      return data as Contact[];
    },
  });
}

export function useCreateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: Partial<Contact>) => {
      const { data, error } = await supabase.from("customer_contacts").insert(v as any).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["contacts"] }); toast.success("Contact added"); },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...v }: Partial<Contact> & { id: string }) => {
      const { data, error } = await supabase.from("customer_contacts").update(v).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contacts"] }),
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("customer_contacts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contacts"] }),
    onError: (e: any) => toast.error(e.message),
  });
}

// ---------- Activities ----------
export function useCustomerActivities(opportunityId?: string) {
  return useQuery({
    queryKey: ["customer-activities", opportunityId ?? "all"],
    queryFn: async () => {
      let q = supabase.from("customer_activities").select("*").order("activity_date", { ascending: false });
      if (opportunityId) q = q.eq("opportunity_id", opportunityId);
      const { data, error } = await q;
      if (error) throw error;
      return data as CustomerActivity[];
    },
  });
}

export function useCreateCustomerActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: Partial<CustomerActivity>) => {
      const { data, error } = await supabase.from("customer_activities").insert(v as any).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer-activities"] });
      toast.success("Activity added");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// ---------- Documents ----------
export function useCustomerDocuments(opportunityId?: string) {
  return useQuery({
    queryKey: ["customer-documents", opportunityId ?? "all"],
    queryFn: async () => {
      let q = supabase.from("customer_documents").select("*").order("created_at", { ascending: false });
      if (opportunityId) q = q.eq("opportunity_id", opportunityId);
      const { data, error } = await q;
      if (error) throw error;
      return data as CustomerDocument[];
    },
  });
}

export function useCreateCustomerDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: Partial<CustomerDocument>) => {
      const { data, error } = await supabase.from("customer_documents").insert(v as any).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer-documents"] });
      toast.success("Document uploaded");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteCustomerDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, fileUrl }: { id: string; fileUrl: string }) => {
      await supabase.storage.from("customer-documents").remove([fileUrl]);
      const { error } = await supabase.from("customer_documents").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customer-documents"] }),
    onError: (e: any) => toast.error(e.message),
  });
}

// ---------- Master data ----------
export function useOppTypes() {
  return useQuery({
    queryKey: ["opp-types"],
    queryFn: async () => {
      const { data, error } = await supabase.from("opportunity_types").select("*")
        .eq("is_active", true).order("sort_order");
      if (error) throw error;
      return data as OppType[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useOppStages() {
  return useQuery({
    queryKey: ["opp-stages"],
    queryFn: async () => {
      const { data, error } = await supabase.from("opportunity_stages").select("*")
        .eq("is_active", true).order("sort_order");
      if (error) throw error;
      return data as OppStage[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ---------- Users for owner picker ----------
export function useUserLookup() {
  return useQuery({
    queryKey: ["users-lookup"],
    queryFn: async () => {
      const { data, error } = await supabase.from("users")
        .select("id, full_name, username, email").eq("is_active", true).order("full_name");
      if (error) throw error;
      return (data || []) as { id: string; full_name: string | null; username: string | null; email: string | null }[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function stageColorClasses(color?: string) {
  switch (color) {
    case "blue":  return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
    case "amber": return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300";
    case "green": return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300";
    case "red":   return "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300";
    case "purple":return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300";
    default:      return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
  }
}
