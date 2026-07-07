import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, FileText, Download, LayoutGrid, List } from "lucide-react";
import {
  useOpportunities, useContacts, useDeleteContact,
  useCustomerActivities, useCustomerDocuments, useDeleteCustomerDocument,
  useOppStages, useOppTypes, useUserLookup, useUpdateOpportunity,
  stageColorClasses,
} from "@/hooks/useCustomers";
import { OpportunityForm } from "@/components/customers/OpportunityForm";
import { ContactForm } from "@/components/customers/ContactForm";
import { ContactOrgChart } from "@/components/customers/ContactOrgChart";
import { ActivityForm } from "@/components/customers/ActivityForm";
import { DocumentUpload } from "@/components/customers/DocumentUpload";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

function inr(n: number) { return `₹ ${(n ?? 0).toLocaleString()}`; }

export default function Customers() {
  const nav = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") ?? "overview";
  const { data: opps = [] } = useOpportunities();
  const { data: contacts = [] } = useContacts();
  const { data: activities = [] } = useCustomerActivities();
  const { data: docs = [] } = useCustomerDocuments();
  const { data: stages = [] } = useOppStages();
  const { data: types = [] } = useOppTypes();
  const { data: users = [] } = useUserLookup();
  const updateOpp = useUpdateOpportunity();
  const deleteContact = useDeleteContact();
  const deleteDoc = useDeleteCustomerDocument();

  const usersMap = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u.full_name || u.username || u.email])), [users]);
  const stageMap = useMemo(() => Object.fromEntries(stages.map((s) => [s.name, s])), [stages]);
  const oppMap = useMemo(() => Object.fromEntries(opps.map((o) => [o.id, o])), [opps]);

  const [newOpp, setNewOpp] = useState(false);
  const [newContact, setNewContact] = useState(false);
  const [editContact, setEditContact] = useState<any>(null);
  const [newAct, setNewAct] = useState(false);
  const [contactView, setContactView] = useState<"list" | "org">("list");
  const [oppView, setOppView] = useState<"table" | "kanban">("table");
  const [fStage, setFStage] = useState("all");
  const [fType, setFType] = useState("all");
  const [fOwner, setFOwner] = useState("all");

  const stats = useMemo(() => {
    const openPipeline = opps
      .filter((o) => !stageMap[o.stage ?? ""]?.is_closed)
      .reduce((s, o) => s + Number(o.amount || 0), 0);
    const wonValue = opps
      .filter((o) => stageMap[o.stage ?? ""]?.is_won)
      .reduce((s, o) => s + Number(o.amount || 0), 0);
    const lastActivity = activities[0]?.activity_date ?? null;
    return { total: opps.length, openPipeline, wonValue, lastActivity, contacts: contacts.length };
  }, [opps, stageMap, activities, contacts]);

  const filteredOpps = opps.filter((o) => {
    if (fStage !== "all" && o.stage !== fStage) return false;
    if (fType !== "all" && o.type !== fType) return false;
    if (fOwner !== "all" && o.owner_id !== fOwner) return false;
    return true;
  });

  const downloadDoc = async (path: string, name: string) => {
    const { data } = await supabase.storage.from("customer-documents").createSignedUrl(path, 60);
    if (data?.signedUrl) {
      const a = document.createElement("a");
      a.href = data.signedUrl; a.download = name; a.click();
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Customers</h1>
        <p className="text-sm text-muted-foreground">Opportunities, contacts, activities & documents</p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setSearchParams(v === "overview" ? {} : { tab: v })}>
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="opportunities">Opportunities</TabsTrigger>
          <TabsTrigger value="contacts">Contacts</TabsTrigger>
          <TabsTrigger value="activities">Activities</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>

        {/* OVERVIEW */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <StatTile label="Total Opportunities" value={String(stats.total)} />
            <StatTile label="Open Pipeline" value={inr(stats.openPipeline)} />
            <StatTile label="Won Value" value={inr(stats.wonValue)} />
            <StatTile label="Total Contacts" value={String(stats.contacts)} />
            <StatTile label="Last Activity" value={stats.lastActivity ? format(new Date(stats.lastActivity), "dd MMM yyyy") : "—"} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-4 space-y-3">
                <h3 className="font-semibold text-sm">Recent Activities</h3>
                {activities.slice(0, 5).map((a) => (
                  <div key={a.id} className="border-b last:border-0 pb-2 last:pb-0">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{a.subject}</span>
                      <span className="text-xs text-muted-foreground">{format(new Date(a.activity_date), "dd MMM")}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {a.type}{a.opportunity_id ? ` · ${oppMap[a.opportunity_id]?.name ?? "Opportunity"}` : ""}
                    </div>
                  </div>
                ))}
                {activities.length === 0 && <p className="text-xs text-muted-foreground">No activities yet.</p>}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 space-y-3">
                <h3 className="font-semibold text-sm">Recent Documents</h3>
                {docs.slice(0, 5).map((d) => (
                  <div key={d.id} className="flex items-center justify-between text-sm border-b last:border-0 pb-2 last:pb-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="truncate">{d.file_name}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{format(new Date(d.created_at), "dd MMM")}</span>
                  </div>
                ))}
                {docs.length === 0 && <p className="text-xs text-muted-foreground">No documents yet.</p>}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* OPPORTUNITIES */}
        <TabsContent value="opportunities" className="mt-4 space-y-3">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex items-center gap-1 border rounded-md p-1">
              <Button size="sm" variant={oppView === "table" ? "default" : "ghost"} onClick={() => setOppView("table")}>
                <List className="h-4 w-4 mr-1" />Table
              </Button>
              <Button size="sm" variant={oppView === "kanban" ? "default" : "ghost"} onClick={() => setOppView("kanban")}>
                <LayoutGrid className="h-4 w-4 mr-1" />Kanban
              </Button>
            </div>
            <Button size="sm" onClick={() => setNewOpp(true)}><Plus className="h-4 w-4 mr-1" />New Opportunity</Button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Select value={fStage} onValueChange={setFStage}>
              <SelectTrigger><SelectValue placeholder="Stage" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All stages</SelectItem>
                {stages.map((s) => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={fType} onValueChange={setFType}>
              <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {types.map((t) => <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={fOwner} onValueChange={setFOwner}>
              <SelectTrigger><SelectValue placeholder="Owner" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All owners</SelectItem>
                {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.full_name || u.username || u.email}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {oppView === "table" ? (
            <Card><CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead>Stage</TableHead>
                  <TableHead>Prob.</TableHead><TableHead>Close Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead><TableHead>Owner</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {filteredOpps.map((o) => (
                    <TableRow key={o.id} className="cursor-pointer" onClick={() => nav(`/opportunities/${o.id}`)}>
                      <TableCell className="font-medium">{o.name}</TableCell>
                      <TableCell>{o.type || "—"}</TableCell>
                      <TableCell><Badge className={stageColorClasses(stageMap[o.stage ?? ""]?.color)}>{o.stage || "—"}</Badge></TableCell>
                      <TableCell>{o.probability}%</TableCell>
                      <TableCell>{o.close_date ? format(new Date(o.close_date), "dd MMM yyyy") : "—"}</TableCell>
                      <TableCell className="text-right font-medium">{inr(Number(o.amount))}</TableCell>
                      <TableCell>{o.owner_id ? usersMap[o.owner_id] ?? "—" : "—"}</TableCell>
                    </TableRow>
                  ))}
                  {filteredOpps.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No opportunities.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent></Card>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-4">
              {stages.map((s) => {
                const col = filteredOpps.filter((o) => o.stage === s.name);
                const colTotal = col.reduce((sum, o) => sum + Number(o.amount || 0), 0);
                return (
                  <div key={s.id} className="min-w-[280px] w-72 flex-shrink-0">
                    <div className="bg-muted/50 rounded-t-lg px-3 py-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge className={stageColorClasses(s.color)}>{s.name}</Badge>
                        <span className="text-xs text-muted-foreground">{col.length}</span>
                      </div>
                      <span className="text-xs font-medium">{inr(colTotal)}</span>
                    </div>
                    <div
                      className="bg-muted/20 rounded-b-lg p-2 space-y-2 min-h-[200px]"
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        const oppId = e.dataTransfer.getData("text/plain");
                        if (oppId) updateOpp.mutate({ id: oppId, stage: s.name });
                      }}
                    >
                      {col.map((o) => (
                        <div key={o.id}
                          draggable
                          onDragStart={(e) => e.dataTransfer.setData("text/plain", o.id)}
                          onClick={() => nav(`/opportunities/${o.id}`)}
                          className="bg-card rounded-lg border p-3 cursor-pointer hover:shadow-md transition-shadow"
                        >
                          <div className="font-medium text-sm truncate">{o.name}</div>
                          <div className="flex justify-between mt-2 text-xs">
                            <span>{o.probability}%</span>
                            <span className="font-medium">{inr(Number(o.amount))}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* CONTACTS */}
        <TabsContent value="contacts" className="mt-4 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 border rounded-md p-1">
              <Button size="sm" variant={contactView === "list" ? "default" : "ghost"} onClick={() => setContactView("list")}>List</Button>
              <Button size="sm" variant={contactView === "org" ? "default" : "ghost"} onClick={() => setContactView("org")}>Org Chart</Button>
            </div>
            <Button size="sm" onClick={() => { setEditContact(null); setNewContact(true); }}>
              <Plus className="h-4 w-4 mr-1" />Add Contact
            </Button>
          </div>

          {contactView === "list" ? (
            <Card><CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Name</TableHead><TableHead>Title</TableHead><TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead><TableHead>Reports To</TableHead><TableHead></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {contacts.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell>{c.title || "—"}</TableCell>
                      <TableCell>{c.email || "—"}</TableCell>
                      <TableCell>{c.phone || "—"}</TableCell>
                      <TableCell>{contacts.find((x) => x.id === c.reports_to_id)?.name ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => { setEditContact(c); setNewContact(true); }}>Edit</Button>
                        <Button size="sm" variant="ghost" onClick={() => deleteContact.mutate(c.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {contacts.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No contacts yet.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent></Card>
          ) : (
            <Card><CardContent className="p-4">
              <ContactOrgChart contacts={contacts} />
            </CardContent></Card>
          )}
        </TabsContent>

        {/* ACTIVITIES */}
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
                <div className="text-xs text-muted-foreground">
                  {a.type}{a.opportunity_id ? ` · ${oppMap[a.opportunity_id]?.name ?? "Opportunity"}` : ""}
                </div>
                {a.notes && <p className="text-sm mt-1 whitespace-pre-wrap">{a.notes}</p>}
              </div>
            ))}
            {activities.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No activities yet.</p>}
          </CardContent></Card>
        </TabsContent>

        {/* DOCUMENTS */}
        <TabsContent value="documents" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <DocumentUpload />
          </div>
          <Card><CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>File</TableHead><TableHead>Linked To</TableHead><TableHead>Size</TableHead>
                <TableHead>Uploaded By</TableHead><TableHead>Uploaded</TableHead><TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {docs.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />{d.file_name}
                    </TableCell>
                    <TableCell>{d.opportunity_id ? oppMap[d.opportunity_id]?.name ?? "Opportunity" : "General"}</TableCell>
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
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No documents yet.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      <OpportunityForm open={newOpp} onOpenChange={setNewOpp} />
      <ContactForm open={newContact} onOpenChange={setNewContact} contact={editContact ?? undefined} />
      <ActivityForm open={newAct} onOpenChange={setNewAct} />
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <Card><CardContent className="p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-bold mt-1 truncate">{value}</div>
    </CardContent></Card>
  );
}
