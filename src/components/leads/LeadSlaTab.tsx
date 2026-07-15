import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Save, CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import { format, addDays, differenceInCalendarDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { LeadRow, useSaveLead } from "@/hooks/useLeadsEvents";
import { useLeadFirstActivityDate } from "@/hooks/useLeadScoring";

type LeadSlaFields = {
  target_first_contact_date?: string | null;
  actual_first_contact_date?: string | null;
  target_conversion_date?: string | null;
  created_by?: string | null;
};

export function LeadSlaTab({ lead }: { lead: LeadRow & LeadSlaFields }) {
  const save = useSaveLead();
  const { data: firstActivityDate } = useLeadFirstActivityDate(lead.id);
  const [creatorName, setCreatorName] = useState<string>("");

  const [targetFirst, setTargetFirst] = useState<string>(
    lead.target_first_contact_date || format(addDays(new Date(lead.created_at), 1), "yyyy-MM-dd"),
  );
  const [actualFirst, setActualFirst] = useState<string>(
    lead.actual_first_contact_date || (firstActivityDate ? String(firstActivityDate).slice(0, 10) : ""),
  );
  const [targetConv, setTargetConv] = useState<string>(
    lead.target_conversion_date || format(addDays(new Date(lead.created_at), 30), "yyyy-MM-dd"),
  );

  useEffect(() => {
    if (!lead.actual_first_contact_date && firstActivityDate) {
      setActualFirst(String(firstActivityDate).slice(0, 10));
    }
  }, [firstActivityDate, lead.actual_first_contact_date]);

  useEffect(() => {
    (async () => {
      if (!lead.created_by) return;
      const { data } = await supabase.from("users").select("full_name, username, email").eq("id", lead.created_by).maybeSingle();
      if (data) setCreatorName((data as any).full_name || (data as any).username || (data as any).email || "");
    })();
  }, [lead.created_by]);

  const isConverted = !!lead.converted_customer_id;
  const today = new Date();
  const overdue =
    !isConverted &&
    ((targetFirst && !actualFirst && new Date(targetFirst) < today) ||
      (targetConv && new Date(targetConv) < today));

  const slaBadge = isConverted
    ? { cls: "bg-emerald-100 text-emerald-700", icon: CheckCircle2, label: "Converted" }
    : overdue
    ? { cls: "bg-rose-100 text-rose-700", icon: AlertTriangle, label: "Overdue" }
    : { cls: "bg-blue-100 text-blue-700", icon: Clock, label: "On Track" };

  const saveAll = () =>
    save.mutateAsync({
      id: lead.id,
      target_first_contact_date: targetFirst || null,
      actual_first_contact_date: actualFirst || null,
      target_conversion_date: targetConv || null,
    } as any);

  const daysToConvert =
    lead.converted_at
      ? differenceInCalendarDays(new Date(lead.converted_at), new Date(lead.created_at))
      : null;

  const Icon = slaBadge.icon;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs text-muted-foreground">SLA Status</div>
            <Badge className={`${slaBadge.cls} text-base px-4 py-1.5 mt-1`}>
              <Icon className="h-4 w-4 mr-1" />{slaBadge.label}
            </Badge>
          </div>
          {daysToConvert !== null && (
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Converted in</div>
              <div className="text-2xl font-bold">{daysToConvert} day{daysToConvert === 1 ? "" : "s"}</div>
            </div>
          )}
          <Button size="sm" onClick={saveAll} disabled={save.isPending}>
            <Save className="h-4 w-4 mr-1" />Save
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Timeline</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground">Created By</Label>
            <div className="text-sm mt-1">
              {creatorName || (lead.created_by ? "—" : "System")} · {format(new Date(lead.created_at), "dd MMM yyyy, HH:mm")}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Target First Contact Date</Label>
              <Input type="date" value={targetFirst} onChange={(e) => setTargetFirst(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Actual First Contact Date</Label>
              <Input type="date" value={actualFirst} onChange={(e) => setActualFirst(e.target.value)} />
              {firstActivityDate && !lead.actual_first_contact_date && (
                <p className="text-xs text-muted-foreground mt-1">Auto-suggested from first activity</p>
              )}
            </div>
            <div>
              <Label className="text-xs">Target Conversion Date</Label>
              <Input type="date" value={targetConv} onChange={(e) => setTargetConv(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Actual Conversion Date</Label>
              <Input
                type="date"
                value={lead.converted_at ? format(new Date(lead.converted_at), "yyyy-MM-dd") : ""}
                readOnly
                disabled
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Label className="text-xs">Is Converted</Label>
            <Badge variant={isConverted ? "default" : "secondary"}>{isConverted ? "Yes" : "No"}</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
