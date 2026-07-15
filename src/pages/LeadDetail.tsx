import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Edit, UserPlus, Phone, Mail, Globe, Building2, MapPin, Briefcase } from "lucide-react";
import {
  useLead, useLeadStatuses, useSaveLead, useLeadAuditLog, useLeadSources, useEvents, statusColorClasses,
} from "@/hooks/useLeadsEvents";
import { LeadForm } from "@/components/leads/LeadForm";
import { ConvertLeadDialog } from "@/components/leads/ConvertLeadDialog";
import { LeadScoreTab } from "@/components/leads/LeadScoreTab";
import { LeadSlaTab } from "@/components/leads/LeadSlaTab";
import { format } from "date-fns";

export default function LeadDetail() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { data: lead, isLoading } = useLead(id);
  const { data: statuses = [] } = useLeadStatuses(false);
  const { data: sources = [] } = useLeadSources(false);
  const { data: events = [] } = useEvents();
  const { data: audit = [] } = useLeadAuditLog(id);
  const save = useSaveLead();

  const [editOpen, setEditOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);

  if (isLoading || !lead) return <div className="p-6 text-muted-foreground">Loading…</div>;

  const currentStatus = statuses.find((s) => s.id === lead.lead_status_id);
  const source = sources.find((s) => s.id === lead.lead_source_id);
  const event = events.find((e) => e.id === lead.related_event_id);
  const isConverted = !!lead.converted_customer_id;
  const statusIsConverted =
    !!currentStatus && currentStatus.name.trim().toLowerCase() === "converted";

  const changeStatus = (statusId: string) =>
    save.mutateAsync({ id: lead.id, lead_status_id: statusId });

  const Field = ({ icon: Icon, label, value }: any) =>
    value ? (
      <div className="flex items-start gap-2 text-sm">
        <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
        <div><div className="text-xs text-muted-foreground">{label}</div><div>{value}</div></div>
      </div>
    ) : null;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">
      <Button variant="ghost" size="sm" onClick={() => nav("/leads")} className="-ml-2">
        <ArrowLeft className="h-4 w-4 mr-1" />Back
      </Button>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-xl flex items-center gap-2 flex-wrap">
              {lead.name}
              {isConverted ? (
                <Badge className={currentStatus ? statusColorClasses(currentStatus.color) : ""}>
                  {currentStatus?.name || "Converted"}
                </Badge>
              ) : (
                <Select value={lead.lead_status_id ?? undefined} onValueChange={changeStatus}>
                  <SelectTrigger
                    className={`h-auto py-1 px-2.5 border-0 gap-1.5 rounded-full text-xs font-semibold w-auto focus:ring-0 focus:ring-offset-0 hover:opacity-80 ${currentStatus ? statusColorClasses(currentStatus.color) : "bg-gray-100 text-gray-700"}`}
                  >
                    <SelectValue placeholder="Set status" />
                  </SelectTrigger>
                  <SelectContent>
                    {statuses.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </CardTitle>
            <div className="text-sm text-muted-foreground">{[lead.title, lead.company].filter(Boolean).join(" · ") || "—"}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}><Edit className="h-4 w-4 mr-1" />Edit</Button>
            {!isConverted && <Button size="sm" onClick={() => setConvertOpen(true)}><UserPlus className="h-4 w-4 mr-1" />Convert</Button>}
            {isConverted && lead.converted_customer_id && (
              <Button size="sm" variant="outline" onClick={() => nav(`/customers/${lead.converted_customer_id}`)}>Open Customer</Button>
            )}
          </div>
        </CardHeader>
      </Card>

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="score">Lead Score (BANT)</TabsTrigger>
          <TabsTrigger value="sla">Lead SLA</TabsTrigger>
          <TabsTrigger value="audit">Audit Log</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field icon={Mail} label="Email" value={lead.email} />
              <Field icon={Phone} label="Phone" value={lead.phone} />
              <Field icon={Globe} label="Website" value={lead.website} />
              <Field icon={Building2} label="Industry" value={lead.industry} />
              <Field icon={MapPin} label="Address" value={lead.address} />
              <Field icon={Briefcase} label="Source" value={source?.name} />
              {event && (
                <div className="flex items-start gap-2 text-sm">
                  <Briefcase className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <div>
                    <div className="text-xs text-muted-foreground">Related Event</div>
                    <button className="text-primary hover:underline" onClick={() => nav(`/events/${event.id}`)}>{event.name}</button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {lead.researched_information && (
            <Card>
              <CardHeader><CardTitle className="text-base">Researched Information</CardTitle></CardHeader>
              <CardContent>
                <div className="text-sm whitespace-pre-wrap leading-relaxed">{lead.researched_information}</div>
              </CardContent>
            </Card>
          )}

          {lead.business_card_url && (
            <Card>
              <CardHeader><CardTitle className="text-base">Business Card</CardTitle></CardHeader>
              <CardContent><div className="text-xs text-muted-foreground">Stored at: {lead.business_card_url}</div></CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="score" className="mt-4">
          <LeadScoreTab lead={lead as any} />
        </TabsContent>

        <TabsContent value="sla" className="mt-4">
          <LeadSlaTab lead={lead as any} />
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Audit Log</CardTitle></CardHeader>
            <CardContent>
              {audit.length === 0 ? (
                <p className="text-sm text-muted-foreground">No history yet</p>
              ) : (
                <div className="space-y-2">
                  {audit.map((a: any) => {
                    const detail = a.from_value && a.to_value
                      ? `${a.from_value} → ${a.to_value}`
                      : (a.to_value || a.from_value || "");
                    return (
                      <div key={a.id} className="text-sm border-l-2 border-primary pl-3 py-1">
                        <div className="font-medium capitalize">{a.action}</div>
                        {detail && <div className="text-xs text-muted-foreground">{detail}</div>}
                        <div className="text-xs text-muted-foreground">
                          by {a.actor_name || "System"} · {format(new Date(a.created_at), "dd MMM yyyy, HH:mm")}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <LeadForm open={editOpen} onOpenChange={setEditOpen} lead={lead} />
      <ConvertLeadDialog open={convertOpen} onOpenChange={setConvertOpen} lead={lead} />
    </div>
  );
}
