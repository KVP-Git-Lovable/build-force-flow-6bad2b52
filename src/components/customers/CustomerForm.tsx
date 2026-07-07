import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Customer, useCreateCustomer, useUpdateCustomer, useUserLookup } from "@/hooks/useCustomers";

const STATUS = ["active", "prospect", "on_hold", "inactive"];

export function CustomerForm({
  open, onOpenChange, customer,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customer?: Customer;
}) {
  const create = useCreateCustomer();
  const update = useUpdateCustomer();
  const { data: users = [] } = useUserLookup();

  const [form, setForm] = useState({
    name: customer?.name ?? "",
    industry: customer?.industry ?? "",
    status: customer?.status ?? "active",
    owner_id: customer?.owner_id ?? "",
  });

  useMemo(() => {
    if (customer) setForm({
      name: customer.name, industry: customer.industry ?? "",
      status: customer.status, owner_id: customer.owner_id ?? "",
    });
  }, [customer]);

  const submit = async () => {
    if (!form.name.trim()) return;
    const payload = {
      name: form.name.trim(),
      industry: form.industry || null,
      status: form.status,
      owner_id: form.owner_id || null,
    };
    if (customer) await update.mutateAsync({ id: customer.id, ...payload });
    else await create.mutateAsync(payload);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{customer ? "Edit Customer" : "New Customer"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label>Industry</Label><Input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} /></div>
          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Owner</Label>
            <Select value={form.owner_id || "none"} onValueChange={(v) => setForm({ ...form, owner_id: v === "none" ? "" : v })}>
              <SelectTrigger><SelectValue placeholder="Select owner" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.full_name || u.username || u.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!form.name.trim()}>{customer ? "Save" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
