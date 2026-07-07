import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, LayoutGrid, List } from "lucide-react";
import {
  useOpportunities, useOppStages, useOppTypes, useUserLookup, useUpdateOpportunity,
  stageColorClasses,
} from "@/hooks/useCustomers";
import { OpportunityForm } from "@/components/customers/OpportunityForm";
import { format } from "date-fns";

function inr(n: number) { return `₹ ${(n ?? 0).toLocaleString()}`; }

export default function Opportunities() {
  const nav = useNavigate();
  const { data: opps = [] } = useOpportunities();
  const { data: stages = [] } = useOppStages();
  const { data: types = [] } = useOppTypes();
  const { data: users = [] } = useUserLookup();
  const updateOpp = useUpdateOpportunity();

  const usersMap = useMemo(
    () => Object.fromEntries(users.map((u) => [u.id, u.full_name || u.username || u.email])),
    [users]
  );
  const stageMap = useMemo(() => Object.fromEntries(stages.map((s) => [s.name, s])), [stages]);

  const [newOpp, setNewOpp] = useState(false);
  const [view, setView] = useState<"table" | "kanban">("table");
  const [fStage, setFStage] = useState("all");
  const [fType, setFType] = useState("all");
  const [fOwner, setFOwner] = useState("all");

  const filtered = opps.filter((o) => {
    if (fStage !== "all" && o.stage !== fStage) return false;
    if (fType !== "all" && o.type !== fType) return false;
    if (fOwner !== "all" && o.owner_id !== fOwner) return false;
    return true;
  });

  const totals = useMemo(() => {
    const open = opps
      .filter((o) => !stageMap[o.stage ?? ""]?.is_closed)
      .reduce((s, o) => s + Number(o.amount || 0), 0);
    const won = opps
      .filter((o) => stageMap[o.stage ?? ""]?.is_won)
      .reduce((s, o) => s + Number(o.amount || 0), 0);
    return { total: opps.length, open, won };
  }, [opps, stageMap]);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Opportunities</h1>
          <p className="text-sm text-muted-foreground">Full pipeline across all customers</p>
        </div>
        <Button size="sm" onClick={() => setNewOpp(true)}>
          <Plus className="h-4 w-4 mr-1" />New Opportunity
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Total</div>
          <div className="text-xl font-bold">{totals.total}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Open Pipeline</div>
          <div className="text-xl font-bold">{inr(totals.open)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Won Value</div>
          <div className="text-xl font-bold">{inr(totals.won)}</div>
        </CardContent></Card>
      </div>

      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="flex items-center gap-1 border rounded-md p-1 w-fit">
          <Button size="sm" variant={view === "table" ? "default" : "ghost"} onClick={() => setView("table")}>
            <List className="h-4 w-4 mr-1" />Table
          </Button>
          <Button size="sm" variant={view === "kanban" ? "default" : "ghost"} onClick={() => setView("kanban")}>
            <LayoutGrid className="h-4 w-4 mr-1" />Kanban
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-2 flex-1">
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
      </div>

      {view === "table" ? (
        <Card><CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead>Stage</TableHead>
              <TableHead>Prob.</TableHead><TableHead>Close Date</TableHead>
              <TableHead className="text-right">Amount</TableHead><TableHead>Owner</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtered.map((o) => (
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
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No opportunities.</TableCell></TableRow>
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

      {newOpp && <OpportunityForm open={newOpp} onOpenChange={setNewOpp} />}
    </div>
  );
}
