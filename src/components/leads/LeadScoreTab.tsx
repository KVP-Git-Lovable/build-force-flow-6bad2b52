import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { differenceInCalendarDays } from "date-fns";
import { Link } from "react-router-dom";
import { Settings2 } from "lucide-react";
import { LeadRow, useLeadStatuses, useSaveLead, statusColorClasses } from "@/hooks/useLeadsEvents";
import {
  useLeadScoringRules, useLeadActivityCount, activityScore, ageScore, statusScore,
  qualificationLevel, ContactRole, CONTACT_ROLE_LABELS,
} from "@/hooks/useLeadScoring";

export function LeadScoreTab({ lead }: { lead: LeadRow & { contact_role?: string | null } }) {
  const { rules } = useLeadScoringRules();
  const { data: statuses = [] } = useLeadStatuses(false);
  const { data: activityCount = 0 } = useLeadActivityCount(lead.id);
  const save = useSaveLead();

  const status = statuses.find((s) => s.id === lead.lead_status_id);
  const ageDays = differenceInCalendarDays(new Date(), new Date(lead.created_at));
  const contactRole = (lead.contact_role || "unknown") as ContactRole;

  const sStatus = statusScore(status?.name, rules);
  const sRole = rules.contactRoleScores[contactRole] ?? 0;
  const sAct = activityScore(activityCount, rules);
  const sAge = ageScore(ageDays, rules);
  const total = sStatus + sRole + sAct + sAge;
  const level = qualificationLevel(total, rules);
  const levelClass =
    level === "High" ? "bg-emerald-100 text-emerald-700"
    : level === "Medium" ? "bg-amber-100 text-amber-700"
    : "bg-rose-100 text-rose-700";

  const Row = ({ label, value, score }: any) => (
    <div className="flex items-center justify-between py-2 border-b last:border-0">
      <div className="text-sm">
        <div className="text-muted-foreground text-xs">{label}</div>
        <div>{value}</div>
      </div>
      <Badge variant="secondary" className="font-mono">{score} pts</Badge>
    </div>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs text-muted-foreground">Total BANT Score</div>
            <div className="text-4xl font-bold">{total}</div>
          </div>
          <Badge className={`${levelClass} text-base px-4 py-1.5`}>{level} Qualification</Badge>
          <Button size="sm" variant="ghost" asChild>
            <Link to="/master-data/lead-scoring"><Settings2 className="h-4 w-4 mr-1" />Configure rules</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Scoring Breakdown</CardTitle></CardHeader>
        <CardContent className="space-y-1">
          <Row label="Lead Status" value={status ? <Badge className={statusColorClasses(status.color)}>{status.name}</Badge> : "—"} score={sStatus} />

          <div className="flex items-center justify-between py-2 border-b">
            <div className="text-sm flex-1">
              <div className="text-muted-foreground text-xs mb-1">Contact Role</div>
              <Select value={contactRole} onValueChange={(v) => save.mutateAsync({ id: lead.id, contact_role: v } as any)}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(CONTACT_ROLE_LABELS) as ContactRole[]).map((r) => (
                    <SelectItem key={r} value={r}>{CONTACT_ROLE_LABELS[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Badge variant="secondary" className="font-mono">{sRole} pts</Badge>
          </div>

          <Row label="Total Activities" value={activityCount} score={sAct} />
          <Row label="Lead Age" value={`${ageDays} day${ageDays === 1 ? "" : "s"}`} score={sAge} />
        </CardContent>
      </Card>
    </div>
  );
}
