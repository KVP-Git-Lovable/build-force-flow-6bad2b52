import { useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, ArrowLeft, Trash2, FileText, Download } from "lucide-react";
import {
  useCustomer, useUpdateCustomer, useOpportunities, useContacts, useDeleteContact,
  useCustomerActivities, useCustomerDocuments, useDeleteCustomerDocument,
  useOppStages, useUserLookup, stageColorClasses,
} from "@/hooks/useCustomers";
import { CustomerForm } from "@/components/customers/CustomerForm";
import { OpportunityForm } from "@/components/customers/OpportunityForm";
import { ContactForm } from "@/components/customers/ContactForm";
import { ContactOrgChart } from "@/components/customers/ContactOrgChart";
import { ActivityForm } from "@/components/customers/ActivityForm";
import { DocumentUpload } from "@/components/customers/DocumentUpload";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

function inr(n: number) { return `₹ ${(n ?? 0).toLocaleString()}`; }

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { data: customer } = useCustomer(id);
  const update = useUpdateCustomer();
  const { data: opps = [] } = useOpportunities(id);
  const { data: contacts = [] } = useContacts(id);
  const { data: activities = [] } = useCustomerActivities(id);
  const { data: docs = [] } = useCustomerDocuments(id);
  const { data: stages = [] } = useOppStages();
  const { data: users = [] } = useUserLookup();
  const usersMap = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u.full_name || u.username || u.email])), [users]);
  const stageMap = useMemo(() => Object.fromEntries(stages.map((s) => [s.name, s])), [stages]);
  const oppMap = useMemo(() => Object.fromEntries(opps.map((o) => [o.id, o])), [opps]);

  const [editCust, setEditCust] = useState(false);
  const [newOpp, setNewOpp] = useState(false);
  const [newContact, setNewContact] = useState(false);
  const [contactView, setContactView] = useState<"list" | "org">("list");
  const [newActivity, setNewActivity] = useState(false);
  const [editContact, setEditContact] = useState<any>(null);
  const deleteContact = useDeleteContact();
  const deleteDoc = useDeleteCustomerDocument();

  const stats = useMemo(() => {
    const openPipeline = opps
      .filter((o) => !stageMap[o.stage ?? ""]?.is_closed)
      .reduce((s, o) => s + Number(o.amount || 0), 0);
    const wonValue = opps
      .filter((o) => stageMap[o.stage ?? ""]?.is_won)
      .reduce((s, o) => s + Number(o.amount || 0), 0);
    const lastActivity = activities[0]?.activity_date ?? null;
    return { total: opps.length, openPipeline, wonValue, lastActivity };
  }, [opps, stageMap, activities]);

  const primaryContact = contacts.find((c) => c.id === customer?.primary_contact_id) ?? contacts[0];

  const downloadDoc = async (path: string, name: string) => {
    const { data } = await supabase.storage.from("customer-documents").createSignedUrl(path, 60);
    if (data?.signedUrl) {
      const a = document.createElement("a");
      a.href = data.signedUrl; a.download = name; a.click();
    }
  };

  if (!customer) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <Button variant="ghost" size="sm" onClick={() => nav("/customers")} className="-ml-2">
        <ArrowLeft className="h-4 w-4 mr-1" />Back to Customers
      </Button>

      {/* Header */}
      <Card>
        <CardContent className="p-4 md:p-6 space-y-4">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold">{customer.name}</h1>
              <p className="text-sm text-muted-foreground">{customer.industry || "—"}</p>
            </div>
            <div className="flex items-center gap-2">
              <Select value={customer.status} onValueChange={(v) => update.mutate({ id: customer.id, status: v })}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="prospect">Prospect</SelectItem>
                  <SelectItem value="on_hold">On hold</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={() => setEditCust(true)}>Edit</Button>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatTile label="Total Opportunities" value={String(stats.total)} />
            <StatTile label="Open Pipeline" value={inr(stats.openPipeline)} />
            <StatTile label="Won Value" value={inr(stats.wonValue)} />
            <StatTile label="Primary Contact" value={primaryContact?.name ?? "—"} />
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="overview">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="opportunities">Opportunities</TabsTrigger>
          <TabsTrigger value="contacts">Contacts</TabsTrigger>
          <TabsTrigger value="activities">Activities</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>

        {/* OVERVIEW */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <StatTile label="Total Opportunities" value={String(stats.total)} />
            <StatTile label="Open Pipeline" value={inr(stats.openPipeline)} />
            <StatTile label="Won Value" value={inr(stats.wonValue)} />
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
                      {a.type} · {a.opportunity_id ? oppMap[a.opportunity_id]?.name ?? "Opportunity" : "General"}
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

          <Card>
            <CardContent className="p-4 space-y-2">
              <h3 className="font-semibold text-sm">Top Contacts</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {contacts.slice(0, 6).map((c) => (
                  <div key={c.id} className="border rounded-lg p-3 text-sm">
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground">{c.title || "—"}</div>
                  </div>
                ))}
                {contacts.length === 0 && <p className="text-xs text-muted-foreground">No contacts yet.</p>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* OPPORTUNITIES */}
        <TabsContent value="opportunities" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setNewOpp(true)}><Plus className="h-4 w-4 mr-1" />New Opportunity</Button>
          </div>
          <Card><CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead>Stage</TableHead>
                <TableHead>Probability</TableHead><TableHead>Close Date</TableHead><TableHead className="text-right">Amount</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {opps.map((o) => (
                  <TableRow key={o.id} className="cursor-pointer" onClick={() => nav(`/opportunities/${o.id}`)}>
                    <TableCell className="font-medium">{o.name}</TableCell>
                    <TableCell>{o.type || "—"}</TableCell>
                    <TableCell>
                      <Badge className={stageColorClasses(stageMap[o.stage ?? ""]?.color)}>{o.stage || "—"}</Badge>
                    </TableCell>
                    <TableCell>{o.probability}%</TableCell>
                    <TableCell>{o.close_date ? format(new Date(o.close_date), "dd MMM yyyy") : "—"}</TableCell>
                    <TableCell className="text-right font-medium">{inr(Number(o.amount))}</TableCell>
                  </TableRow>
                ))}
                {opps.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No opportunities yet.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent></Card>
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
                        <Button size="sm" variant="ghost" onClick={() => deleteContact.mutate({ id: c.id, customerId: id! })}>
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

          <Card>
            <CardContent className="p-4 space-y-3">
              <h3 className="font-semibold text-sm">Contact Relationship Matrix</h3>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Contact</TableHead><TableHead>Title</TableHead><TableHead>Last Contact</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {contacts.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell>{c.title || "—"}</TableCell>
                      <TableCell>{c.last_contact_at ? format(new Date(c.last_contact_at), "dd MMM yyyy") : "—"}</TableCell>
                    </TableRow>
                  ))}
                  {contacts.length === 0 && (
                    <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">No contacts yet.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ACTIVITIES */}
        <TabsContent value="activities" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setNewActivity(true)}><Plus className="h-4 w-4 mr-1" />New Activity</Button>
          </div>
          <Card><CardContent className="p-4 space-y-3">
            {activities.map((a) => (
              <div key={a.id} className="border-l-2 border-primary/40 pl-3 py-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">{a.subject}</span>
                  <span className="text-xs text-muted-foreground">{format(new Date(a.activity_date), "dd MMM yyyy")}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {a.type} · {a.opportunity_id ? oppMap[a.opportunity_id]?.name ?? "Opportunity" : "General"}
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
            <DocumentUpload customerId={id!} />
          </div>
          <Card><CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>File</TableHead><TableHead>Source</TableHead><TableHead>Size</TableHead>
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
                      <Button size="sm" variant="ghost" onClick={() => deleteDoc.mutate({ id: d.id, customerId: id!, fileUrl: d.file_url })}>
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

      <CustomerForm open={editCust} onOpenChange={setEditCust} customer={customer} />
      <OpportunityForm open={newOpp} onOpenChange={setNewOpp} customerId={id!} />
      <ContactForm open={newContact} onOpenChange={setNewContact} customerId={id!} contact={editContact ?? undefined} />
      <ActivityForm open={newActivity} onOpenChange={setNewActivity} customerId={id!} />
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold mt-1 truncate">{value}</div>
    </div>
  );
}
