import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Building2 } from "lucide-react";
import { useCustomers, useOpportunities, useUserLookup } from "@/hooks/useCustomers";
import { CustomerForm } from "@/components/customers/CustomerForm";

function statusColor(s: string) {
  switch (s) {
    case "active":   return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300";
    case "prospect": return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
    case "on_hold":  return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300";
    default:         return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
  }
}

export default function Customers() {
  const nav = useNavigate();
  const { data: customers = [], isLoading } = useCustomers();
  const { data: allOpps = [] } = useOpportunities();
  const { data: users = [] } = useUserLookup();

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [owner, setOwner] = useState("all");
  const [open, setOpen] = useState(false);

  const usersMap = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u.full_name || u.username || u.email])), [users]);

  const oppStats = useMemo(() => {
    const m = new Map<string, { open: number; pipeline: number }>();
    allOpps.forEach((o) => {
      const cur = m.get(o.customer_id) ?? { open: 0, pipeline: 0 };
      const closed = (o.stage ?? "").toLowerCase().includes("closed");
      if (!closed) { cur.open += 1; cur.pipeline += Number(o.amount) || 0; }
      m.set(o.customer_id, cur);
    });
    return m;
  }, [allOpps]);

  const filtered = customers.filter((c) => {
    if (status !== "all" && c.status !== status) return false;
    if (owner !== "all" && c.owner_id !== owner) return false;
    if (q && !`${c.name} ${c.industry ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Customers</h1>
          <p className="text-sm text-muted-foreground">Manage your customer accounts</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-2" />New Customer</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="relative md:col-span-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search customers…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="prospect">Prospect</SelectItem>
            <SelectItem value="on_hold">On hold</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <Select value={owner} onValueChange={setOwner}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All owners</SelectItem>
            {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.full_name || u.username || u.email}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Building2 className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p>No customers yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((c) => {
            const st = oppStats.get(c.id) ?? { open: 0, pipeline: 0 };
            return (
              <Card key={c.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => nav(`/customers/${c.id}`)}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold truncate">{c.name}</h3>
                      <p className="text-xs text-muted-foreground truncate">{c.industry || "—"}</p>
                    </div>
                    <Badge className={statusColor(c.status)}>{c.status.replace("_", " ")}</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <div className="text-muted-foreground">Owner</div>
                      <div className="font-medium truncate">{c.owner_id ? usersMap[c.owner_id] ?? "—" : "—"}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Open Opps</div>
                      <div className="font-medium">{st.open}</div>
                    </div>
                    <div className="col-span-2">
                      <div className="text-muted-foreground">Pipeline Value</div>
                      <div className="font-semibold">₹ {st.pipeline.toLocaleString()}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <CustomerForm open={open} onOpenChange={setOpen} />
    </div>
  );
}
