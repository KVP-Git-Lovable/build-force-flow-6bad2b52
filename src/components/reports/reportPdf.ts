import jsPDF from "jspdf";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { downloadPDF } from "@/utils/nativeDownload";

export interface PdfColumn {
  header: string;
  width: number; // relative weight
  align?: "left" | "right" | "center";
}

export interface PdfSummaryItem {
  label: string;
  value: string;
}

export interface GenerateReportPdfArgs {
  title: string;
  filters: string[];
  columns: PdfColumn[];
  rows: string[][];
  summary?: PdfSummaryItem[];
  generatedBy: string;
  orientation?: "portrait" | "landscape";
  fileName: string;
  /** Optional chart image (PNG data URL) rendered below the table/summary. */
  chartImage?: { data: string; aspect: number };
}

interface CompanyInfo {
  company_name: string | null;
  logo_url: string | null;
  address: string | null;
}

let cachedCompany: CompanyInfo | null | undefined;

async function getCompany(): Promise<CompanyInfo | null> {
  if (cachedCompany !== undefined) return cachedCompany;
  try {
    const { data } = await supabase
      .from("company_profile")
      .select("company_name, logo_url, address");
    const rows = (data ?? []) as CompanyInfo[];
    // Prefer the profile row that actually has a logo uploaded.
    cachedCompany =
      rows.find((r) => r.logo_url && r.logo_url.trim() !== "") ?? rows[0] ?? null;
  } catch {
    cachedCompany = null;
  }
  return cachedCompany;
}

async function loadImageDataUrl(url: string): Promise<{ data: string; w: number; h: number } | null> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const dataUrl: string = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
    const dims: { w: number; h: number } = await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => resolve({ w: 1, h: 1 });
      img.src = dataUrl;
    });
    return { data: dataUrl, w: dims.w, h: dims.h };
  } catch {
    return null;
  }
}

export async function generateReportPdf(args: GenerateReportPdfArgs): Promise<void> {
  const orientation = args.orientation ?? "landscape";
  const doc = new jsPDF({ orientation, unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 12;
  const usableW = pageW - margin * 2;

  const company = await getCompany();
  const companyName = company?.company_name || "Quickapp";

  let y = margin;

  // ---- Header ----
  let textX = margin;
  let headerBottom = y + 11;
  if (company?.logo_url) {
    const img = await loadImageDataUrl(company.logo_url);
    if (img) {
      const logoH = 21; // ~80px
      const logoW = Math.min(24, (img.w / img.h) * logoH);
      const fmt = img.data.startsWith("data:image/jpeg") || img.data.startsWith("data:image/jpg")
        ? "JPEG"
        : "PNG";
      try {
        doc.addImage(img.data, fmt, margin, y, logoW, logoH);
        headerBottom = Math.max(headerBottom, y + logoH);
      } catch {
        /* ignore unsupported format */
      }
      textX = margin + logoW + 5;
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(20, 30, 60);
  doc.text(companyName, textX, y + 7);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110, 110, 110);
  if (company?.address) doc.text(String(company.address).slice(0, 90), textX, y + 12);

  y = headerBottom + 4;

  doc.setDrawColor(200, 170, 80);
  doc.setLineWidth(0.6);
  doc.line(margin, y, pageW - margin, y);
  y += 7;

  // ---- Title ----
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(20, 30, 60);
  doc.text(args.title, margin, y);
  y += 6;

  // ---- Filters ----
  if (args.filters.length) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(90, 90, 90);
    const filterText = args.filters.join("    |    ");
    const lines = doc.splitTextToSize(filterText, usableW);
    doc.text(lines, margin, y);
    y += lines.length * 4 + 2;
  }

  // ---- Table ----
  const totalWeight = args.columns.reduce((s, c) => s + c.width, 0);
  const colX: number[] = [];
  let acc = margin;
  const colWidths = args.columns.map((c) => (c.width / totalWeight) * usableW);
  args.columns.forEach((_, i) => {
    colX.push(acc);
    acc += colWidths[i];
  });

  const drawHeader = () => {
    doc.setFillColor(20, 30, 60);
    doc.rect(margin, y, usableW, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    args.columns.forEach((c, i) => {
      const cx = c.align === "right" ? colX[i] + colWidths[i] - 2 : colX[i] + 2;
      doc.text(c.header, cx, y + 4.7, { align: c.align === "right" ? "right" : "left" });
    });
    y += 7;
  };

  drawHeader();

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(40, 40, 40);

  args.rows.forEach((row, idx) => {
    // compute row height based on wrapped cells
    const wrapped = row.map((cell, i) =>
      doc.splitTextToSize(String(cell ?? ""), colWidths[i] - 3)
    );
    const rowLines = Math.max(...wrapped.map((w) => w.length), 1);
    const rowH = rowLines * 4 + 2;

    if (y + rowH > pageH - 16) {
      doc.addPage();
      y = margin;
      drawHeader();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(40, 40, 40);
    }

    if (idx % 2 === 1) {
      doc.setFillColor(244, 246, 250);
      doc.rect(margin, y, usableW, rowH, "F");
    }

    wrapped.forEach((cellLines, i) => {
      const align = args.columns[i].align;
      const cx = align === "right" ? colX[i] + colWidths[i] - 2 : colX[i] + 2;
      doc.text(cellLines, cx, y + 4, { align: align === "right" ? "right" : "left" });
    });
    y += rowH;
  });

  // ---- Summary ----
  if (args.summary && args.summary.length) {
    if (y + 10 + args.summary.length * 5 > pageH - 16) {
      doc.addPage();
      y = margin;
    }
    y += 5;
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, y, pageW - margin, y);
    y += 6;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(20, 30, 60);
    doc.text("Summary", margin, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(50, 50, 50);
    args.summary.forEach((s) => {
      doc.text(`${s.label}:`, margin + 2, y);
      doc.setFont("helvetica", "bold");
      doc.text(s.value, margin + 70, y);
      doc.setFont("helvetica", "normal");
      y += 5;
    });
  }

  // ---- Optional chart image ----
  if (args.chartImage) {
    const imgW = usableW;
    const imgH = imgW / (args.chartImage.aspect || 2);
    if (y + imgH + 6 > pageH - 16) {
      doc.addPage();
      y = margin;
    }
    y += 6;
    try {
      doc.addImage(args.chartImage.data, "PNG", margin, y, imgW, imgH);
      y += imgH;
    } catch {
      /* ignore */
    }
  }



  // ---- Footer on every page ----
  const pageCount = doc.getNumberOfPages();
  const stamp = format(new Date(), "dd MMM yyyy, HH:mm");
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(130, 130, 130);
    doc.text(
      `Generated: ${stamp}  •  By: ${args.generatedBy}`,
      margin,
      pageH - 7
    );
    doc.text(`Page ${p} of ${pageCount}`, pageW - margin, pageH - 7, { align: "right" });
  }

  await downloadPDF(doc, args.fileName);
}
