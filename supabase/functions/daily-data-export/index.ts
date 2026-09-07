/**
 * Daily database export: every public table → CSV → one ZIP → emailed via
 * Resend to the operations mailbox. Triggered by pg_cron at 12:45 UTC
 * (18:15 IST) — see migration *_daily_data_export.sql — or manually with a
 * service-role bearer token.
 *
 * Design notes:
 *  - Tables are enumerated by the SECURITY DEFINER RPC list_export_tables()
 *    (service_role only), so new tables are included automatically — no
 *    hardcoded list to drift (export-to-quicklocate's list is already stale).
 *  - Every table is paginated (.range) — PostgREST caps unpaginated selects
 *    at 1000 rows, which would silently truncate large tables.
 *  - Limits: Resend caps an email at ~40 MB; the zipped CSVs are far below
 *    that today. If the export ever outgrows it, switch to uploading the ZIP
 *    to Storage and emailing a link.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { zipSync, strToU8 } from "npm:fflate@0.8.2";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 1000;
const EXPORT_TO = "Abhishek.S@kvpcorp.com";
const EXPORT_FROM = "SBEE Exports <onboarding@resend.dev>";

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return '""';
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return '"' + s.replace(/"/g, '""') + '"';
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "# empty\n";
  const headers = Object.keys(rows[0]);
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(","));
  }
  return lines.join("\n") + "\n";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: "Supabase env missing" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!resendKey) {
    return new Response(JSON.stringify({ error: "RESEND_API_KEY secret not set" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  // Self-guard: the platform's JWT check admits anon tokens too — this export
  // must only run for the scheduled job (which sends the shared token kept in
  // the service-role-only export_job_auth table) or for a manual call carrying
  // the service-role key itself.
  const auth = req.headers.get("authorization") ?? "";
  let authorized = auth === `Bearer ${serviceKey}`;
  if (!authorized) {
    const provided = req.headers.get("x-export-secret") ?? "";
    if (provided) {
      const { data: tokenRow } = await supabase
        .from("export_job_auth")
        .select("token")
        .eq("token", provided)
        .maybeSingle();
      authorized = !!tokenRow;
    }
  }
  if (!authorized) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }


  try {
    const { data: tableRows, error: listError } = await supabase.rpc("list_export_tables");
    if (listError) throw new Error(`list_export_tables failed: ${listError.message}`);
    const tables: string[] = (tableRows ?? [])
      .map((t: unknown) => (typeof t === "string" ? t : (t as { table_name?: string })?.table_name))
      .filter((t: unknown): t is string => typeof t === "string" && t.length > 0);

    const files: Record<string, Uint8Array> = {};
    let totalRows = 0;
    const failedTables: string[] = [];

    for (const table of tables) {
      try {
        const rows: Record<string, unknown>[] = [];
        let offset = 0;
        for (;;) {
          const { data, error } = await supabase
            .from(table)
            .select("*")
            .range(offset, offset + BATCH_SIZE - 1);
          if (error) throw new Error(error.message);
          rows.push(...((data ?? []) as Record<string, unknown>[]));
          if (!data || data.length < BATCH_SIZE) break;
          offset += BATCH_SIZE;
        }
        files[`${table}.csv`] = strToU8(toCsv(rows));
        totalRows += rows.length;
      } catch (tableError) {
        // One broken table must not abort the whole export — record it
        // visibly inside the bundle instead.
        failedTables.push(table);
        const message = tableError instanceof Error ? tableError.message : String(tableError);
        files[`${table}.ERROR.txt`] = strToU8(`Export failed: ${message}\n`);
      }
    }

    const today = new Date().toISOString().split("T")[0];
    const zipBytes = zipSync(files, { level: 6 });

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: EXPORT_FROM,
        to: [EXPORT_TO],
        subject: "SBEE data export",
        text: "Please find SBEE data export",
        attachments: [
          {
            filename: `sbee-export-${today}.zip`,
            content: encodeBase64(zipBytes),
          },
        ],
      }),
    });
    const emailBody = await emailResponse.json().catch(() => null);
    if (!emailResponse.ok) {
      throw new Error(
        `Resend rejected the email (${emailResponse.status}): ${JSON.stringify(emailBody)}`
      );
    }

    const summary = {
      tables: tables.length,
      failedTables,
      totalRows,
      zipBytes: zipBytes.length,
      emailId: emailBody?.id ?? null,
    };
    console.log("[daily-data-export]", JSON.stringify(summary));
    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[daily-data-export] failed:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
