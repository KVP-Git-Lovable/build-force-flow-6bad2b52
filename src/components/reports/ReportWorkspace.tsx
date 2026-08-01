import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Loader2, Search, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { SummaryCards } from "./ReportShell";
import { ColumnPicker } from "./ColumnPicker";
import { ChartBuilder } from "./ChartBuilder";
import { SavedReportBar } from "./SavedReportBar";
import { generateReportPdf } from "./reportPdf";
import { useSavedReports } from "@/hooks/useSavedReports";
import type { ChartConfig, ReportColumn, SavedReport } from "./reportTypes";

interface Props<R> {
  /** Stable key used to store saved reports, e.g. "leads". */
  module: string;
  title: string;
  description?: string;
  pill?: ReactNode;
  columns: ReportColumn<R>[];
  rows: R[];
  rowKey: (row: R) => string;
  /** Return a route to open the underlying record when the row is clicked. */
  rowLink?: (row: R) => string | null;
  /** Filter controls rendered in the filter grid. */
  filters: ReactNode;
  /** Serialisable filter state saved with the report. */
  filterState: Record<string, unknown>;
  onApplyFilterState: (state: Record<string, unknown>) => void;
  /** Human readable filter lines for the PDF header. */
  filterSummary: string[];
  fileName: string;
  /** Shown in the PDF header. */
  generatedBy?: string;
  summary?: { label: string; value: string }[];
  defaultCharts?: ChartConfig[];
  loading: boolean;
  generated: boolean;
  onGenerate: () => void;
}

export function ReportWorkspace<R>({
  module,
  title,
  description,
  pill,
  columns,
  rows,
  rowKey,
  rowLink,
  filters,
  filterState,
  onApplyFilterState,
  filterSummary,
  fileName,
  generatedBy = "",
  summary,
  defaultCharts = [],
  loading,
  generated,
  onGenerate,
}: Props<R>) {
  const navigate = useNavigate();
  const { favourite, loading: savedLoading } = useSavedReports(module);

  const [visible, setVisible] = useState<string[]>(
    columns.filter((c) => !c.defaultHidden).map((c) => c.key)
  );
  const [charts, setCharts] = useState<ChartConfig[]>(defaultCharts);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeName, setActiveName] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const appliedFavourite = useRef(false);

  const apply = (r: SavedReport) => {
    if (r.config.filters) onApplyFilterState(r.config.filters);
    if (r.config.visibleColumns?.length) {
      setVisible(r.config.visibleColumns.filter((k) => columns.some((c) => c.key === k)));
    }
    setCharts(r.config.charts || []);
    setActiveId(r.id);
    setActiveName(r.name);
  };

  // Open the pinned report automatically on first load.
  useEffect(() => {
    if (savedLoading || appliedFavourite.current || !favourite) return;
    appliedFavourite.current = true;
    apply(favourite);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedLoading, favourite]);

  const visibleColumns = useMemo(
    () => columns.filter((c) => visible.includes(c.key)),
    [columns, visible]
  );

  const cellText = (col: ReportColumn<R>, row: R) => {
    const v = col.value(row);
    if (v === null || v === undefined || v === "") return "-";
    return typeof v === "number" ? v.toLocaleString("en-IN") : String(v);
  };

  const download = async () => {
    setDownloading(true);
    try {
      await generateReportPdf({
        title,
        fileName,
        generatedBy,
        filters: filterSummary,
        columns: visibleColumns.map((c) => ({
          header: c.header,
          width: c.pdfWidth || 2,
          align: c.align === "right" ? "right" : "left",
        })),
        rows: rows.map((r) => visibleColumns.map((c) => cellText(c, r))),
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">{title}</h1>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {pill}
      </div>

      <Card className="shadow-card">
        <CardContent className="p-4 space-y-4">
          <SavedReportBar
            module={module}
            currentConfig={{ filters: filterState, visibleColumns: visible, charts }}
            activeId={activeId}
            activeName={activeName}
            onApply={apply}
            onSaved={(id, name) => {
              setActiveId(id);
              setActiveName(name);
            }}
            onCleared={() => {
              setActiveId(null);
              setActiveName(null);
            }}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">{filters}</div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={onGenerate} disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Search className="h-4 w-4 mr-2" />
              )}
              Generate Report
            </Button>
            <ColumnPicker columns={columns} visible={visible} onChange={setVisible} />
            <Button
              variant="outline"
              onClick={download}
              disabled={!generated || rows.length === 0 || downloading}
            >
              {downloading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Download PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      {generated && (
        <>
          {summary && summary.length > 0 && <SummaryCards items={summary} />}

          <ChartBuilder columns={columns} rows={rows} charts={charts} onChange={setCharts} />

          <p className="text-sm text-muted-foreground">
            Showing {rows.length} record{rows.length !== 1 ? "s" : ""}
          </p>

          {rows.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No records found for the selected filters.
              </CardContent>
            </Card>
          ) : (
            <Card className="shadow-card">
              <CardContent className="p-0 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {visibleColumns.map((c) => (
                        <TableHead key={c.key} className={c.align === "right" ? "text-right" : ""}>
                          {c.header}
                        </TableHead>
                      ))}
                      {rowLink && <TableHead className="w-8" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => {
                      const link = rowLink?.(r) || null;
                      return (
                        <TableRow
                          key={rowKey(r)}
                          onClick={() => link && navigate(link)}
                          className={link ? "cursor-pointer hover:bg-muted/60" : ""}
                        >
                          {visibleColumns.map((c) => (
                            <TableCell key={c.key} className={c.align === "right" ? "text-right" : ""}>
                              {c.render ? c.render(r) : cellText(c, r)}
                            </TableCell>
                          ))}
                          {rowLink && (
                            <TableCell className="w-8 text-muted-foreground">
                              {link && <ChevronRight className="h-4 w-4" />}
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
