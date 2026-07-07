import { useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { LayoutGrid, List } from "lucide-react";
import {
  useOpportunities, useCustomers, useOppStages, useOppTypes, useUserLookup,
  useUpdateOpportunity, stageColorClasses,
} from "@/hooks/useCustomers";

function inr(n: number) { return `₹ ${(n ?? 0).toLocaleString()}`; }

export default function Opportunities() {
  const nav = useNavigate();
  const { data: opps = [] } = useOpportunities();
  const { data: customers = [] } = useCustomers();
  const { data: stages = [] } = useOppStages();
  const { data: types = [] } = useOppTypes();
  const { data: users = [] } = useUserLookup();
  const update = useUpdateOpportunity();

  const custMap = useMemo(() => Object.fromEntries(customers.map((c) => [c.id, c.name])), [customers]);
  const usersMap = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u.full_name || u.username || u.email])), [users]);
  const stageMap = useMemo(() => Object.fromEntries(stages.map((s) => [s.name, s])), [stages]);

  const [view, setView] = useState<"table" | "kanban">("table");
  const [fStage, setFStage] = useState("all");
  const [fType, setFType] = useState("all");
  const [fOwner, setFOwner] = useState("all");
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");

  const filtered = opps.filter((o) => {
    if (fStage !== "all" && o.stage !== fStage) return false;
    if (fType !== "all" && o.type !== fType) return false;
    if (fOwner !== "all" && o.owner_id !== fOwner) return false;
    if (fFrom && (!o.close_date || o.close_date < fFrom)) return false;
    if (fTo && (!o.close_date || o.close_date > fTo)) return false;
    return true;
  });

  const summary = useMemo(() => {
    const total = filtered.reduce((s, o) => s + Number(o.amount || 0), 0);
    const weighted = filtered.reduce((s, o) => s + (Number(o.amount || 0) * (o.probability || 0)) / 100, 0);
    const qStart = new Date(); qStart.setMonth(Math.floor(qStart.getMonth() / 3) * 3, 1); qStart.setHours(0, 0, 0, 0);
    const wonQ = filtered
      .filter((o) => stageMap[o.stage ?? ""]?.is_won && o.updated_at && new Date(o.updated_at) >= qStart)
      .reduce((s, o) => s + Number(o.amount || 0), 0);
    return { total, weighted, wonQ };
  }, [filtered, stageMap]);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Opportunities</h1>
          <p className="text-sm text-muted-foreground">Pipeline across all customers</p>
        </div>
        <div className="flex items-center gap-1 border rounded-md p-1">
          <Button size="sm" variant={view === "table" ? "default" : "ghost"} onClick={() => setView("table")}>
            <List className="h-4 w-4 mr-1" />Table
          </Button>
          <Button size="sm" variant={view === "kanban" ? "default" : "ghost"} onClick={() => setView("kanban")}>
            <LayoutGrid className="h-4 w-4 mr-1" />Kanban
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <SummaryCard label="Total Pipeline" value={inr(summary.total)} />
        <SummaryCard label="Weighted Pipeline" value={inr(Math.round(summary.weighted))} />
        <SummaryCard label="Won This Quarter" value={inr(summary.wonQ)} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
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
        <Input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} placeholder="From" />
        <Input type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} placeholder="To" />
      </div>

      {view === "table" ? (
        <Card><CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Customer</TableHead><TableHead>Name</TableHead><TableHead>Type</TableHead>
              <TableHead>Stage</TableHead><TableHead>Prob.</TableHead><TableHead>Close Date</TableHead>
              <TableHead className="text-right">Amount</TableHead><TableHead>Owner</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtered.map((o) => (
                <TableRow key={o.id} className="cursor-pointer" onClick={() => nav(`/opportunities/${o.id}`)}>
                  <TableCell>
                    <Link to={`/customers/${o.customer_id}`} onClick={(e) => e.stopPropagation()}
                      className="text-primary hover:underline">{custMap[o.customer_id] || "—"}</Link>
                  </TableCell>
                  <TableCell className="font-medium">{o.name}</TableCell>
                  <TableCell>{o.type || "—"}</TableCell>
                  <TableCell><Badge className={stageColorClasses(stageMap[o.stage ?? ""]?.color)}>{o.stage || "—"}</Badge></TableCell>
                  <TableCell>{o.probability}%</TableCell>
                  <TableCell>{o.close_date || "—"}</TableCell>
                  <TableCell className="text-right font-medium">{inr(Number(o.amount))}</TableCell>
                  <TableCell>{o.owner_id ? usersMap[o.owner_id] ?? "—" : "—"}</TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">No opportunities.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent></Card>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {stages.map((s) => {
            const col = filtered.filter((o) => o.stage === s.name);
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
                    if (oppId) update.mutate({ id: oppId, stage: s.name });
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
                      <div className="text-xs text-muted-foreground truncate">{custMap[o.customer_id]}</div>
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
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card><CardContent className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </CardContent></Card>
  );
}
