import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Edit, UserPlus, Phone, Mail, Globe, Building2, MapPin, Briefcase, Copy, Trash2, User, Users, Tag, CalendarDays } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useLead, useLeadStatuses, useSaveLead, useLeadAuditLog, useLeadSources, useEvents, useDeleteLead, useIndustries, statusColorClasses,
} from "@/hooks/useLeadsEvents";
import { CONTACT_ROLE_LABELS, ContactRole, useLeadScoringRules } from "@/hooks/useLeadScoring";
import { useLeadInsight, bantScore, BANT_LEVEL_CLASSES, SLA_BADGE_CLASSES } from "@/hooks/useLeadInsights";
import { LeadAttachments } from "@/components/leads/LeadAttachments";
import { LeadActivityComposer } from "@/components/leads/LeadActivityComposer";
import { useLeadActivities } from "@/hooks/useLeadActivities";
import { Plus } from "lucide-react";
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
  const { data: industries = [] } = useIndustries();
  const { data: audit = [] } = useLeadAuditLog(id);
  const save = useSaveLead();
  const del = useDeleteLead();
  const { data: activities = [] } = useLeadActivities(id);
  const { rules } = useLeadScoringRules();
  const insight = useLeadInsight(id);

  const [editOpen, setEditOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [newAct, setNewAct] = useState(false);
  const [editAct, setEditAct] = useState<any>(null);

  if (isLoading || !lead) return <div className="p-6 text-muted-foreground">Loading…</div>;

  const currentStatus = statuses.find((s) => s.id === lead.lead_status_id);
  const bant = bantScore(
    {
      statusName: currentStatus?.name,
      contactRole: (lead as any).contact_role,
      activityCount: insight?.activityCount ?? 0,
      createdAt: lead.created_at,
    },
    rules,
  );
  const slaStatus = insight?.sla ?? "Not Started";
  const source = sources.find((s) => s.id === lead.lead_source_id);
  const event = events.find((e) => e.id === lead.related_event_id);
  const isConverted = !!lead.converted_customer_id;
  const statusIsConverted =
    !!currentStatus && currentStatus.name.trim().toLowerCase() === "converted";

  const changeStatus = (statusId: string) =>
    save.mutateAsync({ id: lead.id, lead_status_id: statusId });

  const cloneLead = async () => {
    setCloning(true);
    try {
      const {
        id: _id, created_at, updated_at, converted_customer_id, converted_at, ...rest
      } = lead as any;
      const created = await save.mutateAsync({ ...rest, name: `${lead.name} (Copy)` } as any);
      if ((created as any)?.id) nav(`/leads/${(created as any).id}`);
    } finally {
      setCloning(false);
    }
  };

  const Field = ({ icon: Icon, label, value }: any) => (
    <div className="group flex items-start gap-2 text-sm">
      <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="break-words">{value ?? "—"}</div>
      </div>
      <button
        type="button"
        aria-label={`Edit ${label}`}
        onClick={() => setEditOpen(true)}
        className="shrink-0 p-1 rounded text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
      >
        <Edit className="h-3.5 w-3.5" />
      </button>
    </div>
  );


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
            
            <Button variant="outline" size="sm" onClick={cloneLead} disabled={cloning}>
              <Copy className="h-4 w-4 mr-1" />{cloning ? "Cloning…" : "Clone"}
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-4 w-4 mr-1" />Delete
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 rounded-lg border bg-muted/30 p-3">
            <div>
              <div className="text-[11px] text-muted-foreground">BANT Score</div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-lg font-bold leading-none">{bant.total}</span>
                <Badge className={`${BANT_LEVEL_CLASSES[bant.level]} text-[10px]`}>{bant.level}</Badge>
              </div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">Lead SLA</div>
              <Badge className={`${SLA_BADGE_CLASSES[slaStatus]} text-[10px] mt-1`}>{slaStatus}</Badge>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">Opportunity Value</div>
              <div className="text-sm font-semibold mt-0.5">
                {(lead as any).opportunity_value != null
                  ? `₹${Number((lead as any).opportunity_value).toLocaleString("en-IN")}`
                  : "—"}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">Close Date</div>
              <div className="text-sm font-semibold mt-0.5">
                {(lead as any).opportunity_close_date
                  ? format(new Date((lead as any).opportunity_close_date), "dd MMM yyyy")
                  : "—"}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">Probability of Win</div>
              <div className="text-sm font-semibold mt-0.5">
                {(lead as any).opportunity_probability != null ? `${(lead as any).opportunity_probability}%` : "—"}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="score">Lead Score (BANT)</TabsTrigger>
          <TabsTrigger value="sla">Lead SLA</TabsTrigger>
          <TabsTrigger value="activities">Activities</TabsTrigger>
          <TabsTrigger value="attachments">Attachments ({insight?.documentCount ?? 0})</TabsTrigger>
          <TabsTrigger value="audit">Audit Log</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field icon={User} label="Name" value={lead.name} />
              <Field icon={Briefcase} label="Designation" value={lead.title} />
              <Field icon={Users} label="Contact Role" value={CONTACT_ROLE_LABELS[((lead as any).contact_role || "unknown") as ContactRole] ?? "Unknown"} />
              <Field icon={Building2} label="Company" value={lead.company} />
              <Field icon={Mail} label="Email" value={lead.email} />
              <Field icon={Phone} label="Phone" value={lead.phone} />
              <Field icon={Globe} label="Website" value={lead.website} />
              <Field icon={Building2} label="Industry" value={industries.find((i) => i.id === lead.industry)?.name ?? lead.industry} />
              <Field
                icon={Tag}
                label="Status"
                value={currentStatus ? <Badge className={statusColorClasses(currentStatus.color)}>{currentStatus.name}</Badge> : "—"}
              />
              <Field icon={Briefcase} label="Source" value={source?.name} />
              <Field
                icon={CalendarDays}
                label="Related Event"
                value={event ? (
                  <button className="text-primary hover:underline" onClick={() => nav(`/events/${event.id}`)}>{event.name}</button>
                ) : "—"}
              />
              <Field icon={MapPin} label="Address" value={lead.address} />
              <Field icon={CalendarDays} label="Created" value={lead.created_at ? format(new Date(lead.created_at), "dd MMM yyyy, HH:mm") : "—"} />
              <Field icon={CalendarDays} label="Last Modified" value={(lead as any).updated_at ? format(new Date((lead as any).updated_at), "dd MMM yyyy, HH:mm") : "—"} />
            </CardContent>
          </Card>

          {((lead as any).opportunity_value != null ||
            (lead as any).opportunity_close_date ||
            (lead as any).opportunity_probability != null) && (
            <Card>
              <CardHeader><CardTitle className="text-base">Opportunity Highlight</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs text-muted-foreground">Opportunity Value</div>
                    <div>{(lead as any).opportunity_value != null ? `₹${Number((lead as any).opportunity_value).toLocaleString("en-IN")}` : "—"}</div>
                  </div>
                  <button type="button" aria-label="Edit Opportunity Value" onClick={() => setEditOpen(true)} className="shrink-0 p-1 rounded text-muted-foreground hover:text-primary hover:bg-muted"><Edit className="h-3.5 w-3.5" /></button>
                </div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs text-muted-foreground">Close Date</div>
                    <div>{(lead as any).opportunity_close_date ? format(new Date((lead as any).opportunity_close_date), "dd MMM yyyy") : "—"}</div>
                  </div>
                  <button type="button" aria-label="Edit Close Date" onClick={() => setEditOpen(true)} className="shrink-0 p-1 rounded text-muted-foreground hover:text-primary hover:bg-muted"><Edit className="h-3.5 w-3.5" /></button>
                </div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs text-muted-foreground">Probability of Win</div>
                    <div>{(lead as any).opportunity_probability != null ? `${(lead as any).opportunity_probability}%` : "—"}</div>
                  </div>
                  <button type="button" aria-label="Edit Probability of Win" onClick={() => setEditOpen(true)} className="shrink-0 p-1 rounded text-muted-foreground hover:text-primary hover:bg-muted"><Edit className="h-3.5 w-3.5" /></button>
                </div>
              </CardContent>
            </Card>
          )}

          {lead.researched_information && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle className="text-base">Requirement Overview</CardTitle>
                <button type="button" aria-label="Edit Requirement Overview" onClick={() => setEditOpen(true)} className="shrink-0 p-1 rounded text-muted-foreground hover:text-primary hover:bg-muted"><Edit className="h-3.5 w-3.5" /></button>
              </CardHeader>
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

        <TabsContent value="activities" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => { setEditAct(null); setNewAct(true); }}><Plus className="h-4 w-4 mr-1" />New Activity</Button>
          </div>
          <Card><CardContent className="p-4 space-y-3">
            {activities.map((a: any) => (
              <div
                key={a.id}
                role="button"
                tabIndex={0}
                onClick={() => { setEditAct(a); setNewAct(true); }}
                className="border-l-2 border-primary/40 pl-3 py-2 cursor-pointer rounded-r hover:bg-muted/50 transition-colors"
              >
                <div className="flex justify-between gap-2 text-sm">
                  <span className="font-medium">{a.activity_name}</span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {format(new Date(a.activity_date), "dd MMM yyyy")}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap mt-0.5">
                  <span>{a.activity_type}</span>
                  {a.outcome && <Badge variant="outline" className="text-[10px]">{a.outcome}</Badge>}
                </div>
                {a.description && <p className="text-sm mt-1 whitespace-pre-wrap">{a.description}</p>}
              </div>
            ))}
            {activities.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">No activities yet.</p>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="attachments" className="mt-4">
          <LeadAttachments leadId={lead.id} />
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
      <LeadActivityComposer
        open={newAct}
        onOpenChange={(v) => { setNewAct(v); if (!v) setEditAct(null); }}
        leadId={lead.id}
        editActivity={editAct}
      />

      <ConvertLeadDialog open={convertOpen} onOpenChange={setConvertOpen} lead={lead} />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this lead?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes “{lead.name}” and its history. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => { await del.mutateAsync(lead.id); nav("/leads"); }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
