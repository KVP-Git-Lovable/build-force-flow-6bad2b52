import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateMilestone } from "@/hooks/useCustomers";

export function MilestoneForm({
  open, onOpenChange, opportunityId,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; opportunityId: string;
}) {
  const create = useCreateMilestone();
  const [form, setForm] = useState({ name: "", invoice_value: 0, invoice_number: "", invoice_date: "" });

  const submit = async () => {
    if (!form.name.trim()) return;
    await create.mutateAsync({
      opportunity_id: opportunityId,
      name: form.name.trim(),
      invoice_value: Number(form.invoice_value) || 0,
      invoice_number: form.invoice_number || null,
      invoice_date: form.invoice_date || null,
      status: "Pending",
    });
    onOpenChange(false);
    setForm({ name: "", invoice_value: 0, invoice_number: "", invoice_date: "" });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Payment Milestone</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Milestone Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label>Invoice Value</Label>
            <Input type="number" min={0} value={form.invoice_value}
              onChange={(e) => setForm({ ...form, invoice_value: Number(e.target.value) })} />
          </div>
          <div><Label>Invoice Number</Label><Input value={form.invoice_number} onChange={(e) => setForm({ ...form, invoice_number: e.target.value })} /></div>
          <div><Label>Invoice Date</Label><Input type="date" value={form.invoice_date} onChange={(e) => setForm({ ...form, invoice_date: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!form.name.trim()}>Add</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
