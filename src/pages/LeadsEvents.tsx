import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, Users, Calendar, TrendingUp, IndianRupee } from "lucide-react";
import { useEvents, useLeads, useLeadStatuses, eventStatus, statusColorClasses } from "@/hooks/useLeadsEvents";
import { EventForm } from "@/components/leads/EventForm";
import { LeadForm } from "@/components/leads/LeadForm";
import { format } from "date-fns";

function KpiCard({ icon: Icon, label, value, color }: any) {
  return (
    <Card><CardContent className="p-4 flex items-center gap-3">
      <div className={`p-2 rounded-lg ${color}`}><Icon className="h-5 w-5" /></div>
      <div><div className="text-xs text-muted-foreground">{label}</div><div className="text-xl font-bold">{value}</div></div>
    </CardContent></Card>
  );
}

export default function LeadsEvents() {
  const nav = useNavigate();
  const { data: events = [] } = useEvents();
  const { data: leads = [] } = useLeads();
  const { data: statuses = [] } = useLeadStatuses(false);
  const statusMap = useMemo(() => Object.fromEntries(statuses.map((s) => [s.id, s])), [statuses]);

  const [tab, setTab] = useState("leads");
  const [q, setQ] = useState("");
  const [eventOpen, setEventOpen] = useState(false);
  const [leadOpen, setLeadOpen] = useState(false);

  const kpis = useMemo(() => {
    const converted = leads.filter((l) => !!l.converted_customer_id).length;
    const totalBudget = events.reduce((s, e) => s + Number(e.budget_amount || 0), 0);
    return {
      totalLeads: leads.length,
      converted,
      conversionRate: leads.length ? Math.round((converted / leads.length) * 100) : 0,
      totalEvents: events.length,
      totalBudget,
    };
  }, [leads, events]);

  const filteredLeads = leads.filter((l) =>
    !q || [l.name, l.company, l.email, l.phone].some((v) => (v ?? "").toLowerCase().includes(q.toLowerCase())),
  );
  const filteredEvents = events.filter((e) => !q || e.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <motion.div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div>
        <h1 className="text-2xl font-bold">Leads & Events</h1>
        <p className="text-sm text-muted-foreground">Capture leads from events and convert them into customers</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={Users} label="Total Leads" value={kpis.totalLeads} color="bg-blue-100 text-blue-600" />
        <KpiCard icon={TrendingUp} label="Converted" value={`${kpis.converted} (${kpis.conversionRate}%)`} color="bg-emerald-100 text-emerald-600" />
        <KpiCard icon={Calendar} label="Events" value={kpis.totalEvents} color="bg-purple-100 text-purple-600" />
        <KpiCard icon={IndianRupee} label="Event Budget" value={`₹${kpis.totalBudget.toLocaleString()}`} color="bg-amber-100 text-amber-600" />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <TabsList><TabsTrigger value="leads">Leads</TabsTrigger><TabsTrigger value="events">Events</TabsTrigger></TabsList>
          <div className="flex items-center gap-2">
            <div className="relative"><Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" /><Input placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8 w-56" /></div>
            {tab === "leads"
              ? <Button size="sm" onClick={() => setLeadOpen(true)}><Plus className="h-4 w-4 mr-1" />New Lead</Button>
              : <Button size="sm" onClick={() => setEventOpen(true)}><Plus className="h-4 w-4 mr-1" />New Event</Button>}
          </div>
        </div>

        <TabsContent value="leads" className="mt-3">
          <Card><CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Name</TableHead><TableHead>Company</TableHead>
                <TableHead>Phone</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filteredLeads.map((l) => {
                  const st = l.lead_status_id ? statusMap[l.lead_status_id] : null;
                  return (
                    <TableRow key={l.id} className="cursor-pointer" onClick={() => nav(`/leads-events/leads/${l.id}`)}>
                      <TableCell className="font-medium">{l.name}{l.converted_customer_id && <Badge variant="secondary" className="ml-2">Converted</Badge>}</TableCell>
                      <TableCell>{l.company ?? "—"}</TableCell>
                      <TableCell>{l.phone ?? "—"}</TableCell>
                      <TableCell>{st ? <Badge className={statusColorClasses(st.color)}>{st.name}</Badge> : "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{format(new Date(l.created_at), "dd MMM yyyy")}</TableCell>
                    </TableRow>
                  );
                })}
                {filteredLeads.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No leads yet</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="events" className="mt-3">
          <Card><CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Name</TableHead><TableHead>Start</TableHead><TableHead>End</TableHead>
                <TableHead>Budget</TableHead><TableHead>Status</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filteredEvents.map((e) => {
                  const s = eventStatus(e);
                  return (
                    <TableRow key={e.id} className="cursor-pointer" onClick={() => nav(`/leads-events/events/${e.id}`)}>
                      <TableCell className="font-medium">{e.name}</TableCell>
                      <TableCell>{e.start_date ? format(new Date(e.start_date), "dd MMM yyyy") : "—"}</TableCell>
                      <TableCell>{e.end_date ? format(new Date(e.end_date), "dd MMM yyyy") : "—"}</TableCell>
                      <TableCell>₹{Number(e.budget_amount).toLocaleString()}</TableCell>
                      <TableCell><Badge variant="outline">{s}</Badge></TableCell>
                    </TableRow>
                  );
                })}
                {filteredEvents.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No events yet</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      <EventForm open={eventOpen} onOpenChange={setEventOpen} />
      <LeadForm open={leadOpen} onOpenChange={setLeadOpen} />
    </motion.div>
  );
}
