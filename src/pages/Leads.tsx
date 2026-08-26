import { useMemo, useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, TrendingUp, CalendarClock, CheckCircle2, Activity, X } from "lucide-react";
import { useLeads, useLeadStatuses, statusColorClasses } from "@/hooks/useLeadsEvents";
import { LeadForm } from "@/components/leads/LeadForm";
import { useLeadScoringRules } from "@/hooks/useLeadScoring";
import { useLeadsInsights, bantScore, BANT_LEVEL_CLASSES, SLA_BADGE_CLASSES } from "@/hooks/useLeadInsights";
import {
  format, startOfDay, endOfDay, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  subWeeks, subMonths, startOfQuarter, endOfQuarter, subQuarters, isWithinInterval,
} from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

const DATE_PRESETS = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this_week", label: "This week" },
  { value: "last_week", label: "Last week" },
  { value: "current_month", label: "Current month" },
  { value: "last_month", label: "Last month" },
  { value: "this_quarter", label: "This quarter" },
  { value: "last_quarter", label: "Last quarter" },
  { value: "current_fy", label: "Current FY" },
];

function presetRange(preset: string): { start: Date; end: Date } | null {
  const now = new Date();
  switch (preset) {
    case "today": return { start: startOfDay(now), end: endOfDay(now) };
    case "yesterday": return { start: startOfDay(subDays(now, 1)), end: endOfDay(subDays(now, 1)) };
    case "this_week": return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
    case "last_week": {
      const d = subWeeks(now, 1);
      return { start: startOfWeek(d, { weekStartsOn: 1 }), end: endOfWeek(d, { weekStartsOn: 1 }) };
    }
    case "current_month": return { start: startOfMonth(now), end: endOfMonth(now) };
    case "last_month": {
      const d = subMonths(now, 1);
      return { start: startOfMonth(d), end: endOfMonth(d) };
    }
    case "this_quarter": return { start: startOfQuarter(now), end: endOfQuarter(now) };
    case "last_quarter": {
      const d = subQuarters(now, 1);
      return { start: startOfQuarter(d), end: endOfQuarter(d) };
    }
    case "current_fy": {
      // Indian FY: 1 Apr – 31 Mar
      const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
      return { start: new Date(y, 3, 1, 0, 0, 0), end: new Date(y + 1, 2, 31, 23, 59, 59) };
    }
    default: return null;
  }
}

function inRange(value?: string | null, range?: { start: Date; end: Date } | null) {
  if (!range) return true;
  if (!value) return false;
  const d = new Date(value);
  if (isNaN(d.getTime())) return false;
  return isWithinInterval(d, range);
}

/** Activities recorded against leads — used for the completed KPIs and roll-ups */
function useLeadActivityStats() {
  return useQuery({
    queryKey: ["lead-activity-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_events")
        .select("id, status, outcome, activity_date, lead_id")
        .not("lead_id", "is", null);
      if (error) throw error;
      return (data || []) as any[];
    },
    staleTime: 60 * 1000,
  });
}


function KpiCard({ icon: Icon, label, value, sub, color }: any) {
  return (
    <Card><CardContent className="p-4 min-h-[120px] flex flex-col justify-between">
      <div className="flex items-start gap-2 mb-2">
        <div className={`p-2 rounded-lg shrink-0 ${color}`}><Icon className="h-4 w-4 md:h-5 md:w-5" /></div>
        <div className="text-xs md:text-sm text-muted-foreground font-medium line-clamp-2">{label}</div>
      </div>
      <div className="space-y-1">
        <div className="text-lg md:text-2xl font-bold break-words">{value}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </div>
    </CardContent></Card>
  );
}

export default function Leads() {
  const nav = useNavigate();
  const { data: leads = [] } = useLeads();
  const { data: statuses = [] } = useLeadStatuses(false);
  const { data: leadActivities = [] } = useLeadActivityStats();
  const statusMap = useMemo(() => Object.fromEntries(statuses.map((s) => [s.id, s])), [statuses]);

  const [q, setQ] = useState("");
  const [leadOpen, setLeadOpen] = useState(false);
  const [userMap, setUserMap] = useState<Record<string, string>>({});
  const [createdPreset, setCreatedPreset] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [minProductive, setMinProductive] = useState("");
  const [minDaysSince, setMinDaysSince] = useState("");

  // Activity & effort roll-ups per lead
  const rollups = useMemo(() => buildLeadRollups(leadActivities), [leadActivities]);
  const rollupOf = (id: string) => rollups[id] ?? EMPTY_ROLLUP;


  useEffect(() => {
    const ids = Array.from(
      new Set(leads.flatMap((l) => [l.created_by, (l as any).owner_id]).filter(Boolean)),
    ) as string[];
    const missing = ids.filter((id) => !userMap[id]);
    if (!missing.length) return;
    (async () => {
      const { data: usrs } = await supabase.from("users").select("id, full_name, username, email").in("id", missing);
      const map: Record<string, string> = {};
      (usrs ?? []).forEach((u: any) => { map[u.id] = u.full_name || u.username || u.email || ""; });
      const remaining = missing.filter((id) => !map[id]);
      if (remaining.length) {
        const { data: profs } = await supabase.from("profiles").select("id, full_name, username").in("id", remaining);
        (profs ?? []).forEach((p: any) => { map[p.id] = p.full_name || p.username || ""; });
      }
      setUserMap((prev) => ({ ...prev, ...map }));
    })();
  }, [leads, userMap]);

  const ownerOf = (l: any) => (l.owner_id || l.created_by || null) as string | null;

  const ownerOptions = useMemo(() => {
    const ids = Array.from(new Set(leads.map(ownerOf).filter(Boolean))) as string[];
    return ids.map((id) => ({ id, name: userMap[id] || "Unknown" })).sort((a, b) => a.name.localeCompare(b.name));
  }, [leads, userMap]);

  const createdRange = useMemo(() => presetRange(createdPreset), [createdPreset]);
  const modifiedRange = useMemo(() => presetRange(modifiedPreset), [modifiedPreset]);

  const filteredLeads = useMemo(() => leads.filter((l: any) => {
    if (q && ![l.name, l.company, l.email, l.phone].some((v) => (v ?? "").toLowerCase().includes(q.toLowerCase()))) return false;
    if (!inRange(l.created_at, createdRange)) return false;
    if (!inRange(l.updated_at || l.created_at, modifiedRange)) return false;
    if (ownerFilter !== "all" && ownerOf(l) !== ownerFilter) return false;
    if (statusFilter !== "all" && l.lead_status_id !== statusFilter) return false;
    return true;
  }), [leads, q, createdRange, modifiedRange, ownerFilter, statusFilter]);

  const activeFilters = [createdPreset, modifiedPreset, ownerFilter, statusFilter].filter((v) => v !== "all").length;

  const clearAllFilters = () => {
    setCreatedPreset("all"); setModifiedPreset("all"); setOwnerFilter("all"); setStatusFilter("all");
  };

  const filterChips = useMemo(() => {
    const chips: { key: string; label: string; clear: () => void }[] = [];
    const presetLabel = (v: string) => DATE_PRESETS.find((p) => p.value === v)?.label ?? v;
    if (createdPreset !== "all") chips.push({ key: "created", label: `Created: ${presetLabel(createdPreset)}`, clear: () => setCreatedPreset("all") });
    if (modifiedPreset !== "all") chips.push({ key: "modified", label: `Modified: ${presetLabel(modifiedPreset)}`, clear: () => setModifiedPreset("all") });
    if (ownerFilter !== "all") chips.push({ key: "owner", label: `Owner: ${ownerOptions.find((o) => o.id === ownerFilter)?.name ?? "Unknown"}`, clear: () => setOwnerFilter("all") });
    if (statusFilter !== "all") chips.push({ key: "status", label: `Status: ${statusMap[statusFilter]?.name ?? "Unknown"}`, clear: () => setStatusFilter("all") });
    return chips;
  }, [createdPreset, modifiedPreset, ownerFilter, statusFilter, ownerOptions, statusMap]);

  // Progressive rendering for large lists
  const PAGE_SIZE = 20;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [q, createdPreset, modifiedPreset, ownerFilter, statusFilter]);
  const visibleLeads = useMemo(() => filteredLeads.slice(0, visibleCount), [filteredLeads, visibleCount]);
  const { rules: scoringRules } = useLeadScoringRules();
  const visibleIds = useMemo(() => visibleLeads.map((l: any) => l.id), [visibleLeads]);
  const { data: insights = {} } = useLeadsInsights(visibleIds);
  const hasMore = visibleCount < filteredLeads.length;
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) setVisibleCount((c) => c + PAGE_SIZE);
    }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, filteredLeads.length]);

  const kpis = useMemo(() => {
    const now = new Date();
    const monthRange = { start: startOfMonth(now), end: endOfMonth(now) };
    const weekRange = { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };

    const pipeline = filteredLeads.reduce((s: number, l: any) => s + (Number(l.opportunity_value) || 0), 0);
    const closingLeads = filteredLeads.filter((l: any) => inRange(l.opportunity_close_date, monthRange));
    const closingValue = closingLeads.reduce((s: number, l: any) => s + (Number(l.opportunity_value) || 0), 0);

    const leadIds = new Set(filteredLeads.map((l: any) => l.id));
    const completed = leadActivities.filter((a) => a.status === "completed" && leadIds.has(a.lead_id));
    const completedMonth = completed.filter((a) => inRange(a.activity_date, monthRange)).length;
    const completedWeek = completed.filter((a) => inRange(a.activity_date, weekRange)).length;

    return { pipeline, closingCount: closingLeads.length, closingValue, completedMonth, completedWeek };
  }, [filteredLeads, leadActivities]);

  const money = (n: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0, notation: n >= 100000 ? "compact" : "standard" }).format(n || 0);

  return (
    <motion.div className="p-3 md:p-6 space-y-4 max-w-7xl mx-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div>
        <h1 className="text-xl md:text-2xl font-bold">Leads</h1>
        <p className="text-xs md:text-sm text-muted-foreground">Capture and convert leads into customers</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
        <KpiCard icon={TrendingUp} label="Total Opportunity Pipeline" value={money(kpis.pipeline)} sub={`${filteredLeads.length} leads`} color="bg-blue-100 text-blue-600" />
        <KpiCard icon={CalendarClock} label="Closing This Month" value={money(kpis.closingValue)} sub={`${kpis.closingCount} leads`} color="bg-amber-100 text-amber-600" />
        <KpiCard icon={CheckCircle2} label="Activities Completed (Month)" value={kpis.completedMonth} color="bg-emerald-100 text-emerald-600" />
        <KpiCard icon={Activity} label="Activities Completed (Week)" value={kpis.completedWeek} color="bg-purple-100 text-purple-600" />
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 md:flex-none">
          <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
          <Input placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8 w-full md:w-56" />
        </div>
        <Button size="sm" className="shrink-0" onClick={() => setLeadOpen(true)}><Plus className="h-4 w-4 mr-1" />New Lead</Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-3 space-y-2">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Select value={createdPreset} onValueChange={setCreatedPreset}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Created date" /></SelectTrigger>
              <SelectContent className="bg-popover z-50">
                {DATE_PRESETS.map((p) => <SelectItem key={p.value} value={p.value}>{p.value === "all" ? "Created: All time" : `Created: ${p.label}`}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={modifiedPreset} onValueChange={setModifiedPreset}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Last modified" /></SelectTrigger>
              <SelectContent className="bg-popover z-50">
                {DATE_PRESETS.map((p) => <SelectItem key={p.value} value={p.value}>{p.value === "all" ? "Modified: All time" : `Modified: ${p.label}`}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={ownerFilter} onValueChange={setOwnerFilter}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Owner" /></SelectTrigger>
              <SelectContent className="bg-popover z-50">
                <SelectItem value="all">All owners</SelectItem>
                {ownerOptions.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent className="bg-popover z-50">
                <SelectItem value="all">All statuses</SelectItem>
                {statuses.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {activeFilters > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {filterChips.map((c) => (
                  <button
                    key={c.key}
                    onClick={c.clear}
                    className="inline-flex items-center gap-1 rounded-full border bg-secondary/60 px-2.5 py-1 text-[11px] font-medium text-secondary-foreground active:opacity-70"
                  >
                    <span className="max-w-[160px] truncate">{c.label}</span>
                    <X className="h-3 w-3 opacity-70" />
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">{filteredLeads.length} result{filteredLeads.length !== 1 ? "s" : ""}</span>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clearAllFilters}>
                  <X className="h-3 w-3 mr-1" />Clear all
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>


      {/* Mobile: card list */}
      <div className="space-y-2 md:hidden">
        {visibleLeads.map((l: any) => {
          const st = l.lead_status_id ? statusMap[l.lead_status_id] : null;
          const owner = ownerOf(l);
          const ownerName = owner ? (userMap[owner] || "—") : "—";
          const ins = (insights as any)[l.id] ?? { activityCount: 0, documentCount: 0, sla: "Not Started" };
          const score = bantScore(
            {
              statusName: st?.name, contactRole: l.contact_role,
              activityCount: ins.activityCount, createdAt: l.created_at,
              indicativeBudget: l.indicative_budget, opportunityValue: l.opportunity_value,
              requirement: l.researched_information, closeDate: l.opportunity_close_date,
            },
            scoringRules,
          );
          return (
            <Card key={l.id} className="cursor-pointer active:opacity-80" onClick={() => nav(`/leads/${l.id}`)}>
              <CardContent className="p-3 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{l.name}</p>
                    {l.company && <p className="text-xs text-muted-foreground truncate">{l.company}</p>}
                  </div>
                  {st && <Badge className={`${statusColorClasses(st.color)} shrink-0 text-[10px]`}>{st.name}</Badge>}
                </div>
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="truncate">{l.phone ?? "No phone"}</span>
                  <span className="shrink-0">{format(new Date(l.created_at), "dd MMM yyyy")}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground truncate">Owner: {ownerName}</span>
                  <span className="text-[11px] text-muted-foreground shrink-0">{ins.documentCount} doc{ins.documentCount === 1 ? "" : "s"}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 rounded-md bg-muted/40 p-2">
                  <div>
                    <div className="text-[10px] text-muted-foreground">Value</div>
                    <div className="text-[11px] font-semibold truncate">
                      {Number(l.opportunity_value) > 0 ? money(Number(l.opportunity_value)) : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground">Close date</div>
                    <div className="text-[11px] font-semibold truncate">
                      {l.opportunity_close_date ? format(new Date(l.opportunity_close_date), "dd MMM yy") : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground">Win %</div>
                    <div className="text-[11px] font-semibold">
                      {l.opportunity_probability != null ? `${l.opportunity_probability}%` : "—"}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge className={`${BANT_LEVEL_CLASSES[score.level]} text-[10px]`}>BANT {score.total} · {score.level}</Badge>
                  <Badge className={`${SLA_BADGE_CLASSES[ins.sla]} text-[10px]`}>{ins.sla}</Badge>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {filteredLeads.length === 0 && (
          <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">No leads match the filters</CardContent></Card>
        )}
      </div>

      {/* Desktop: table */}
      <Card className="hidden md:block"><CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Name</TableHead><TableHead>Designation</TableHead><TableHead>Company</TableHead>
            <TableHead>Status</TableHead><TableHead>Owner</TableHead>
            <TableHead className="text-right">Opp. Value</TableHead><TableHead>Close Date</TableHead><TableHead className="text-right">Win %</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {visibleLeads.map((l: any) => {
              const st = l.lead_status_id ? statusMap[l.lead_status_id] : null;
              const owner = ownerOf(l);
              const ownerName = owner ? (userMap[owner] || "—") : "—";
              return (
                <TableRow key={l.id} className="cursor-pointer" onClick={() => nav(`/leads/${l.id}`)}>
                  <TableCell className="font-medium">{l.name}{l.converted_customer_id && <Badge variant="secondary" className="ml-2">Converted</Badge>}</TableCell>
                  <TableCell className="text-sm">{l.designation ?? "—"}</TableCell>
                  <TableCell>{l.company ?? "—"}</TableCell>
                  <TableCell>{st ? <Badge className={statusColorClasses(st.color)}>{st.name}</Badge> : "—"}</TableCell>
                  <TableCell className="text-sm">{ownerName}</TableCell>
                  <TableCell className="text-right text-sm font-medium">{Number(l.opportunity_value) > 0 ? money(Number(l.opportunity_value)) : "—"}</TableCell>
                  <TableCell className="text-sm">{l.opportunity_close_date ? format(new Date(l.opportunity_close_date), "dd MMM yyyy") : "—"}</TableCell>
                  <TableCell className="text-right text-sm">{l.opportunity_probability != null ? `${l.opportunity_probability}%` : "—"}</TableCell>
                </TableRow>
              );
            })}
            {filteredLeads.length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No leads match the filters</TableCell></TableRow>}

          </TableBody>
        </Table>
      </CardContent></Card>

      {/* Infinite scroll sentinel */}
      {hasMore && (
        <div ref={sentinelRef} className="flex flex-col items-center gap-2 py-3">
          <span className="text-[11px] text-muted-foreground">
            Showing {visibleLeads.length} of {filteredLeads.length}
          </span>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}>
            Load more
          </Button>
        </div>
      )}

      <LeadForm open={leadOpen} onOpenChange={setLeadOpen} />

    </motion.div>
  );
}
