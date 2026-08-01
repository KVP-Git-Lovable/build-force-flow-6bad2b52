import { useEffect, useMemo, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ReportShell, SummaryCards } from "./ReportShell";
import { DateField, SelectField } from "./ReportFilters";
import { useReportScope } from "./useReportScope";
import { generateReportPdf } from "./reportPdf";

interface Row {
  id: string;
  name: string;
  company: string;
  phone: string;
  status: string;
  source: string;
  owner: string;
  value: number;
  close_date: string | null;
  created_at: string;
}

export default function LeadReport() {
  const scope = useReportScope();
  const [from, setFrom] = useState(format(new Date(), "yyyy-MM-01"));
  const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [owner, setOwner] = useState("all");
  const [status, setStatus] = useState("all");
  const [source, setSource] = useState("all");
  const [statuses, setStatuses] = useState<{ value: string; label: string }[]>([]);
  const [sources, setSources] = useState<{ value: string; label: string }[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [generated, setGenerated] = useState(false);

  useEffect(() => {
    supabase
      .from("master_lead_statuses")
      .select("id, name")
      .order("name")
      .then(({ data }) => setStatuses((data || []).map((s) => ({ value: s.id, label: s.name }))));
    supabase
      .from("master_lead_sources")
      .select("id, name")
      .order("name")
      .then(({ data }) => setSources((data || []).map((s) => ({ value: s.id, label: s.name }))));
  }, []);

  const generate = async () => {
    setLoading(true);
    try {
      let q = supabase
        .from("leads")
        .select(
          "id, name, company, phone, owner_id, lead_status_id, lead_source_id, opportunity_value, opportunity_close_date, created_at"
        )
        .gte("created_at", `${from}T00:00:00`)
        .lte("created_at", `${to}T23:59:59`)
        .order("created_at", { ascending: false });
      if (owner !== "all") q = q.eq("owner_id", owner);
      else if (scope.userIds)
        q = q.in("owner_id", scope.userIds.length ? scope.userIds : ["00000000-0000-0000-0000-000000000000"]);
      if (status !== "all") q = q.eq("lead_status_id", status);
      if (source !== "all") q = q.eq("lead_source_id", source);

      const { data, error } = await q;
      if (error) throw error;

      const nameMap = new Map(scope.users.map((u) => [u.id, u.full_name]));
      const statusMap = new Map(statuses.map((s) => [s.value, s.label]));
      const sourceMap = new Map(sources.map((s) => [s.value, s.label]));

      setRows(
        (data || []).map((r) => ({
          id: r.id,
          name: r.name,
          company: r.company || "-",
          phone: r.phone || "-",
          status: r.lead_status_id ? statusMap.get(r.lead_status_id) || "-" : "-",
          source: r.lead_source_id ? sourceMap.get(r.lead_source_id) || "-" : "-",
          owner: r.owner_id ? nameMap.get(r.owner_id) || "-" : "-",
          value: Number(r.opportunity_value || 0),
          close_date: r.opportunity_close_date,
          created_at: r.created_at,
        }))
      );
      setGenerated(true);
    } catch {
      toast.error("Failed to generate report");
    } finally {
      setLoading(false);
    }
  };

  const summary = useMemo(() => {
    const pipeline = rows.reduce((s, r) => s + r.value, 0);
    return [
      { label: "Total Leads", value: String(rows.length) },
      { label: "Pipeline Value", value: `₹${pipeline.toLocaleString("en-IN")}` },
      { label: "With Close Date", value: String(rows.filter((r) => r.close_date).length) },
      {
        label: "Avg. Value",
        value: rows.length ? `₹${Math.round(pipeline / rows.length).toLocaleString("en-IN")}` : "₹0",
      },
    ];
  }, [rows]);

  const download = async () => {
    setDownloading(true);
    try {
      await generateReportPdf({
        title: "Lead Report",
        fileName: `lead-report-${from}-to-${to}.pdf`,
        generatedBy: scope.generatedBy,
        filters: [
          `Period: ${from} to ${to}`,
          `Owner: ${owner === "all" ? "All" : scope.users.find((u) => u.id === owner)?.full_name || "-"}`,
          `Status: ${status === "all" ? "All" : statuses.find((s) => s.value === status)?.label || "-"}`,
          `Source: ${source === "all" ? "All" : sources.find((s) => s.value === source)?.label || "-"}`,
        ],
        columns: [
          { header: "Lead", width: 2.2 },
          { header: "Company", width: 2.2 },
          { header: "Status", width: 1.6 },
          { header: "Source", width: 1.6 },
          { header: "Owner", width: 2 },
          { header: "Value", width: 1.4, align: "right" },
          { header: "Close Date", width: 1.6 },
        ],
        rows: rows.map((r) => [
          r.name,
          r.company,
          r.status,
          r.source,
          r.owner,
          r.value ? r.value.toLocaleString("en-IN") : "-",
          r.close_date ? format(new Date(r.close_date), "dd MMM yyyy") : "-",
        ]),
        summary,
      });
      toast.success("PDF downloaded");
    } catch {
      toast.error("Failed to download PDF");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <ReportShell
      title="Lead Report"
      description="Leads with status, source, owner and opportunity pipeline."
      loading={loading || scope.loading}
      downloading={downloading}
      generated={generated}
      recordCount={rows.length}
      onGenerate={generate}
      onDownload={download}
      filters={
        <>
          <DateField label="From Date" value={from} onChange={setFrom} />
          <DateField label="To Date" value={to} onChange={setTo} />
          <SelectField
            label="Owner"
            value={owner}
            onChange={setOwner}
            allLabel="All Owners"
            options={scope.users.map((u) => ({ value: u.id, label: u.full_name }))}
          />
          <SelectField label="Status" value={status} onChange={setStatus} allLabel="All Statuses" options={statuses} />
          <SelectField label="Source" value={source} onChange={setSource} allLabel="All Sources" options={sources} />
        </>
      }
      summary={<SummaryCards items={summary} />}
      table={
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lead</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead className="text-right">Value</TableHead>
              <TableHead>Close Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell>{r.company}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{r.status}</Badge>
                </TableCell>
                <TableCell>{r.source}</TableCell>
                <TableCell>{r.owner}</TableCell>
                <TableCell className="text-right">{r.value ? r.value.toLocaleString("en-IN") : "-"}</TableCell>
                <TableCell>{r.close_date ? format(new Date(r.close_date), "dd MMM yyyy") : "-"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      }
    />
  );
}
