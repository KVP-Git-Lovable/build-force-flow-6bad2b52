import { useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, FileText, Trash2, Download } from "lucide-react";
import {
  useOpportunity, useMilestones, useUpdateMilestone, useDeleteMilestone,
  useCustomerActivities, useCustomerDocuments, useDeleteCustomerDocument,
  useOppStages, useUserLookup, useCustomers, stageColorClasses,
  useQuotes, useDeleteQuote,
} from "@/hooks/useCustomers";
import { QuoteForm } from "@/components/customers/QuoteForm";

import { MilestoneForm } from "@/components/customers/MilestoneForm";
import { ActivityForm } from "@/components/customers/ActivityForm";
import { DocumentUpload } from "@/components/customers/DocumentUpload";
import { OpportunityForm } from "@/components/customers/OpportunityForm";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

function inr(n: number) { return `₹ ${(n ?? 0).toLocaleString()}`; }

const MILESTONE_STATUSES = ["Pending", "Invoiced", "Paid"];

export default function OpportunityDetail() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { data: opp } = useOpportunity(id);
  const { data: milestones = [] } = useMilestones(id);
  const { data: activities = [] } = useCustomerActivities(id);
  const { data: docs = [] } = useCustomerDocuments(id);
  const { data: quotes = [] } = useQuotes(id);
  const deleteQuote = useDeleteQuote();
  const { data: stages = [] } = useOppStages();
  const { data: users = [] } = useUserLookup();
  const { data: customers = [] } = useCustomers();
  const usersMap = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u.full_name || u.username || u.email])), [users]);
  const customersMap = useMemo(() => Object.fromEntries(customers.map((c) => [c.id, c.name])), [customers]);

  const stageMap = useMemo(() => Object.fromEntries(stages.map((s) => [s.name, s])), [stages]);
  const updateMs = useUpdateMilestone();
  const deleteMs = useDeleteMilestone();
  const deleteDoc = useDeleteCustomerDocument();

  const [addMs, setAddMs] = useState(false);
  const [newAct, setNewAct] = useState(false);
  const [editOpp, setEditOpp] = useState(false);
  const [quoteEditor, setQuoteEditor] = useState<{ mode: "new" | "edit"; quoteId?: string } | null>(null);
  const editingQuote = quoteEditor?.mode === "edit" ? quotes.find((q) => q.id === quoteEditor.quoteId) : null;

  const total = milestones.reduce((s, m) => s + Number(m.invoice_value || 0), 0);

  const downloadDoc = async (path: string, name: string) => {
    const { data } = await supabase.storage.from("customer-documents").createSignedUrl(path, 60);
    if (data?.signedUrl) {
      const a = document.createElement("a"); a.href = data.signedUrl; a.download = name; a.click();
    }
  };

  if (!opp) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <Button variant="ghost" size="sm" onClick={() => nav(-1)} className="-ml-2">
        <ArrowLeft className="h-4 w-4 mr-1" />Back
      </Button>

      <Card>
        <CardContent className="p-4 md:p-6">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold">{opp.name}</h1>
              <p className="text-sm text-muted-foreground">{opp.type || "—"}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge className={stageColorClasses(stageMap[opp.stage ?? ""]?.color)}>{opp.stage || "—"}</Badge>
              <Button size="sm" variant="outline" onClick={() => setEditOpp(true)}>Edit</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="overview">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="milestones">Payment Milestones</TabsTrigger>
          <TabsTrigger value="activities">Activities</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <Card><CardContent className="p-4 md:p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
              <Field label="Opportunity Name" value={opp.name} />
              <Field
                label="Customer / Account"
                value={
                  opp.customer_id ? (
                    <Link to={`/customers/${opp.customer_id}`} className="text-primary hover:underline">
                      {customersMap[opp.customer_id] ?? "—"}
                    </Link>
                  ) : "—"
                }
              />
              <Field label="Type" value={opp.type || "—"} />
              <Field label="Stage" value={<Badge className={stageColorClasses(stageMap[opp.stage ?? ""]?.color)}>{opp.stage || "—"}</Badge>} />
              <Field label="Probability" value={`${opp.probability}%`} />
              <Field label="Close Date" value={opp.close_date ? format(new Date(opp.close_date), "dd MMM yyyy") : "—"} />
              <Field label="Amount" value={inr(Number(opp.amount))} />
              <Field label="Owner" value={opp.owner_id ? usersMap[opp.owner_id] ?? "—" : "—"} />
            </div>

          </CardContent></Card>
        </TabsContent>

        <TabsContent value="milestones" className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm">
              <span className="text-muted-foreground">Total Invoiced Value:</span>{" "}
              <span className="font-semibold text-base">{inr(total)}</span>
            </div>
            <Button size="sm" onClick={() => setAddMs(true)}><Plus className="h-4 w-4 mr-1" />Add</Button>
          </div>
          <Card><CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Name</TableHead><TableHead>Invoice #</TableHead><TableHead>Invoice Date</TableHead>
                <TableHead className="text-right">Invoice Value</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {milestones.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.name}</TableCell>
                    <TableCell>{m.invoice_number || "—"}</TableCell>
                    <TableCell>{m.invoice_date ? format(new Date(m.invoice_date), "dd MMM yyyy") : "—"}</TableCell>
                    <TableCell className="text-right">{inr(Number(m.invoice_value))}</TableCell>
                    <TableCell>
                      <Select value={m.status} onValueChange={(v) => updateMs.mutate({ id: m.id, status: v, opportunity_id: m.opportunity_id })}>
                        <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>{MILESTONE_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => deleteMs.mutate({ id: m.id, oppId: id! })}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {milestones.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No milestones yet.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="activities" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setNewAct(true)}><Plus className="h-4 w-4 mr-1" />New Activity</Button>
          </div>
          <Card><CardContent className="p-4 space-y-3">
            {activities.map((a) => (
              <div key={a.id} className="border-l-2 border-primary/40 pl-3 py-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">{a.subject}</span>
                  <span className="text-xs text-muted-foreground">{format(new Date(a.activity_date), "dd MMM yyyy")}</span>
                </div>
                <div className="text-xs text-muted-foreground">{a.type}</div>
                {a.notes && <p className="text-sm mt-1 whitespace-pre-wrap">{a.notes}</p>}
              </div>
            ))}
            {activities.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No activities yet.</p>}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="documents" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <DocumentUpload opportunityId={id!} />
          </div>
          <Card><CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>File</TableHead><TableHead>Size</TableHead>
                <TableHead>Uploaded By</TableHead><TableHead>Uploaded</TableHead><TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {docs.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />{d.file_name}
                    </TableCell>
                    <TableCell>{d.file_size ? `${Math.round(d.file_size / 1024)} KB` : "—"}</TableCell>
                    <TableCell>{d.uploaded_by ? usersMap[d.uploaded_by] ?? "—" : "—"}</TableCell>
                    <TableCell>{format(new Date(d.created_at), "dd MMM yyyy")}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => downloadDoc(d.file_url, d.file_name)}>
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => deleteDoc.mutate({ id: d.id, fileUrl: d.file_url })}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {docs.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No documents yet.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      <MilestoneForm open={addMs} onOpenChange={setAddMs} opportunityId={id!} />
      <ActivityForm open={newAct} onOpenChange={setNewAct} opportunityId={id!} lockOpportunity />
      <OpportunityForm open={editOpp} onOpenChange={setEditOpp} opportunity={opp} />
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium mt-0.5">{value}</div>
    </div>
  );
}
