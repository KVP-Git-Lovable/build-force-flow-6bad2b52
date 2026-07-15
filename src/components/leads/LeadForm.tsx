import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { BusinessCardScanner } from "./BusinessCardScanner";
import {
  LeadRow, useSaveLead, useLeadStatuses, useLeadSources, useEvents,
} from "@/hooks/useLeadsEvents";
import { useCurrentUser } from "@/hooks/useCurrentUser";

export function LeadForm({
  open, onOpenChange, lead, defaultEventId,
}: { open: boolean; onOpenChange: (v: boolean) => void; lead?: LeadRow; defaultEventId?: string }) {
  const save = useSaveLead();
  const { data: statuses = [] } = useLeadStatuses();
  const { data: sources = [] } = useLeadSources();
  const { data: events = [] } = useEvents();
  const { userId } = useCurrentUser();

  const emptyForm = {
    name: "", title: "", company: "", email: "", phone: "", website: "", address: "", industry: "",
    lead_status_id: "", lead_source_id: "", related_event_id: defaultEventId ?? "",
    business_card_url: "", researched_information: "",
  };
  const [f, setF] = useState(emptyForm);
  const [isElaborating, setIsElaborating] = useState(false);

  useEffect(() => {
    if (lead) {
      setF({
        name: lead.name, title: lead.title ?? "", company: lead.company ?? "",
        email: lead.email ?? "", phone: lead.phone ?? "", website: lead.website ?? "",
        address: lead.address ?? "", industry: lead.industry ?? "",
        lead_status_id: lead.lead_status_id ?? "",
        lead_source_id: lead.lead_source_id ?? "",
        related_event_id: lead.related_event_id ?? "",
        business_card_url: lead.business_card_url ?? "",
        researched_information: lead.researched_information ?? "",
      });
    } else {
      setF({ ...emptyForm, related_event_id: defaultEventId ?? "" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead, open, defaultEventId]);

  useEffect(() => {
    if (!lead && !f.lead_status_id && statuses.length) {
      setF((prev) => ({ ...prev, lead_status_id: statuses[0].id }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statuses, lead]);

  const applyScanned = (d: any, path: string) => {
    setF((p) => ({
      ...p,
      name: d.name || p.name,
      title: d.title || p.title,
      company: d.company || p.company,
      email: d.email || p.email,
      phone: d.phone || p.phone,
      website: d.website || p.website,
      address: d.address || p.address,
      business_card_url: path,
    }));
  };

  const handleElaborate = async () => {
    if (!f.company.trim() && !f.name.trim() && !f.researched_information.trim()) {
      toast.error("Add a name, company, or some notes first");
      return;
    }
    setIsElaborating(true);
    try {
      const { data, error } = await supabase.functions.invoke("elaborate-lead-research", {
        body: {
          name: f.name, designation: f.title, company: f.company,
          industry: f.industry, website: f.website, draft: f.researched_information,
        },
      });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); return; }
      if (data?.details) {
        setF((prev) => ({ ...prev, researched_information: data.details }));
        toast.success("Research generated");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to generate research");
    } finally {
      setIsElaborating(false);
    }
  };

  const submit = async () => {
    if (!f.name.trim()) return;
    await save.mutateAsync({
      id: lead?.id,
      name: f.name.trim(),
      title: f.title || null,
      company: f.company || null,
      email: f.email || null,
      phone: f.phone || null,
      website: f.website || null,
      address: f.address || null,
      industry: f.industry || null,
      lead_status_id: f.lead_status_id || null,
      lead_source_id: f.lead_source_id || null,
      related_event_id: f.related_event_id || null,
      business_card_url: f.business_card_url || null,
      researched_information: f.researched_information.trim() || null,
      owner_id: lead?.owner_id ?? userId ?? null,
      ...(lead?.id ? {} : { created_by: userId ?? null }),
    } as any);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-3">
            <span>{lead ? "Edit Lead" : "New Lead"}</span>
            {!lead && <BusinessCardScanner onScanned={applyScanned} />}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><Label>Name *</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
            <div><Label>Designation</Label><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
            <div><Label>Company</Label><Input value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} /></div>
            <div><Label>Industry</Label><Input value={f.industry} onChange={(e) => setF({ ...f, industry: e.target.value })} /></div>
            <div><Label>Email</Label><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
            <div><Label>Phone</Label><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
            <div><Label>Website</Label><Input value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} /></div>
            <div>
              <Label>Status</Label>
              <Select value={f.lead_status_id} onValueChange={(v) => setF({ ...f, lead_status_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{statuses.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Source</Label>
              <Select value={f.lead_source_id} onValueChange={(v) => setF({ ...f, lead_source_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{sources.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Related Event</Label>
              <Select value={f.related_event_id || "__none"} onValueChange={(v) => setF({ ...f, related_event_id: v === "__none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">None</SelectItem>
                  {events.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <Label>Researched Information</Label>
              <Button type="button" variant="outline" size="sm" onClick={handleElaborate} disabled={isElaborating}>
                {isElaborating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
                AI Elaborate
              </Button>
            </div>
            <Textarea
              rows={5}
              placeholder="Background research on this lead/company — company size, recent news, pain points, competitor info… or leave blank and click AI Elaborate."
              value={f.researched_information}
              onChange={(e) => setF({ ...f, researched_information: e.target.value })}
            />
          </div>

          <div>
            <Label>Address</Label>
            <Textarea rows={2} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!f.name.trim() || save.isPending}>{lead ? "Save" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
