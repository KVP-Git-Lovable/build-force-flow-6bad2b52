import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, Users, TrendingUp, UserCheck, Clock } from "lucide-react";
import { useLeads, useLeadStatuses, statusColorClasses } from "@/hooks/useLeadsEvents";
import { LeadForm } from "@/components/leads/LeadForm";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

function KpiCard({ icon: Icon, label, value, color }: any) {
  return (
    <Card><CardContent className="p-4 flex items-center gap-3">
      <div className={`p-2 rounded-lg ${color}`}><Icon className="h-5 w-5" /></div>
      <div><div className="text-xs text-muted-foreground">{label}</div><div className="text-xl font-bold">{value}</div></div>
    </CardContent></Card>
  );
}

export default function Leads() {
  const nav = useNavigate();
  const { data: leads = [] } = useLeads();
  const { data: statuses = [] } = useLeadStatuses(false);
  const statusMap = useMemo(() => Object.fromEntries(statuses.map((s) => [s.id, s])), [statuses]);

  const [q, setQ] = useState("");
  const [leadOpen, setLeadOpen] = useState(false);
  const [userMap, setUserMap] = useState<Record<string, string>>({});

  useEffect(() => {
    const ids = Array.from(new Set(leads.map((l) => l.created_by).filter(Boolean))) as string[];
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

  const kpis = useMemo(() => {
    const converted = leads.filter((l) => !!l.converted_customer_id).length;
    const open = leads.length - converted;
    return {
      totalLeads: leads.length,
      converted,
      open,
      conversionRate: leads.length ? Math.round((converted / leads.length) * 100) : 0,
    };
  }, [leads]);

  const filteredLeads = leads.filter((l) =>
    !q || [l.name, l.company, l.email, l.phone].some((v) => (v ?? "").toLowerCase().includes(q.toLowerCase())),
  );

  return (
    <motion.div className="p-3 md:p-6 space-y-4 max-w-7xl mx-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div>
        <h1 className="text-xl md:text-2xl font-bold">Leads</h1>
        <p className="text-xs md:text-sm text-muted-foreground">Capture and convert leads into customers</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
        <KpiCard icon={Users} label="Total Leads" value={kpis.totalLeads} color="bg-blue-100 text-blue-600" />
        <KpiCard icon={Clock} label="Open" value={kpis.open} color="bg-amber-100 text-amber-600" />
        <KpiCard icon={UserCheck} label="Converted" value={kpis.converted} color="bg-emerald-100 text-emerald-600" />
        <KpiCard icon={TrendingUp} label="Conversion Rate" value={`${kpis.conversionRate}%`} color="bg-purple-100 text-purple-600" />
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 md:flex-none">
          <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
          <Input placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8 w-full md:w-56" />
        </div>
        <Button size="sm" className="shrink-0" onClick={() => setLeadOpen(true)}><Plus className="h-4 w-4 mr-1" />New Lead</Button>
      </div>

      {/* Mobile: card list */}
      <div className="space-y-2 md:hidden">
        {filteredLeads.map((l) => {
          const st = l.lead_status_id ? statusMap[l.lead_status_id] : null;
          const creator = l.created_by ? (userMap[l.created_by] || "—") : "—";
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
                  <span className="text-[11px] text-muted-foreground truncate">By {creator}</span>
                  {l.converted_customer_id && <Badge variant="secondary" className="text-[10px] shrink-0">Converted</Badge>}
                </div>
              </CardContent>
            </Card>
          );
        })}
        {filteredLeads.length === 0 && (
          <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">No leads yet</CardContent></Card>
        )}
      </div>

      {/* Desktop: table */}
      <Card className="hidden md:block"><CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Name</TableHead><TableHead>Company</TableHead>
            <TableHead>Phone</TableHead><TableHead>Status</TableHead>
            <TableHead>Created By</TableHead><TableHead>Created</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {filteredLeads.map((l) => {
              const st = l.lead_status_id ? statusMap[l.lead_status_id] : null;
              const creator = l.created_by ? (userMap[l.created_by] || "—") : "—";
              return (
                <TableRow key={l.id} className="cursor-pointer" onClick={() => nav(`/leads/${l.id}`)}>
                  <TableCell className="font-medium">{l.name}{l.converted_customer_id && <Badge variant="secondary" className="ml-2">Converted</Badge>}</TableCell>
                  <TableCell>{l.company ?? "—"}</TableCell>
                  <TableCell>{l.phone ?? "—"}</TableCell>
                  <TableCell>{st ? <Badge className={statusColorClasses(st.color)}>{st.name}</Badge> : "—"}</TableCell>
                  <TableCell className="text-sm">{creator}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{format(new Date(l.created_at), "dd MMM yyyy")}</TableCell>
                </TableRow>
              );
            })}
            {filteredLeads.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No leads yet</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent></Card>


      <LeadForm open={leadOpen} onOpenChange={setLeadOpen} />
    </motion.div>
  );
}
