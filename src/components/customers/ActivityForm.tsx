import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateCustomerActivity, useOpportunities } from "@/hooks/useCustomers";

const TYPES = ["Note", "Call", "Meeting", "Email", "Task"];

export function ActivityForm({
  open, onOpenChange, opportunityId, lockOpportunity, customerId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  opportunityId?: string;
  lockOpportunity?: boolean;
  customerId?: string;
}) {
  const create = useCreateCustomerActivity();
  const { data: opps = [] } = useOpportunities(customerId);

  const [form, setForm] = useState({
    type: "Note", subject: "", notes: "", activity_date: new Date().toISOString().slice(0, 10),
    opportunity_id: opportunityId ?? "",
  });

  useEffect(() => {
    setForm((f) => ({ ...f, opportunity_id: opportunityId ?? "" }));
  }, [opportunityId, open]);

  const submit = async () => {
    if (!form.subject.trim()) return;
    await create.mutateAsync({
      opportunity_id: form.opportunity_id || null,
      customer_id: customerId ?? null,
      type: form.type,
      subject: form.subject.trim(),
      notes: form.notes || null,
      activity_date: new Date(form.activity_date).toISOString(),
    });
    onOpenChange(false);
    setForm({ type: "Note", subject: "", notes: "", activity_date: new Date().toISOString().slice(0, 10), opportunity_id: opportunityId ?? "" });
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>New Activity</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={form.activity_date} onChange={(e) => setForm({ ...form, activity_date: e.target.value })} />
            </div>
          </div>
          <div><Label>Subject *</Label><Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></div>
          <div><Label>Notes</Label><Textarea rows={4} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          {!lockOpportunity && (
            <div>
              <Label>Link to Opportunity</Label>
              <Select value={form.opportunity_id || "none"}
                onValueChange={(v) => setForm({ ...form, opportunity_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="General" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">General</SelectItem>
                  {opps.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!form.subject.trim()}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
