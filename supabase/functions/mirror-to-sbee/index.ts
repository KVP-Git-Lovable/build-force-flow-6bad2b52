import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TABLES = [
  "activity_events",
  "activity_types_master",
  "attendance",
  "attendance_policy",
  "customers",
  "customer_activities",
  "customer_contacts",
  "customer_contact_roles",
  "customer_documents",
  "customer_opportunities",
  "leads",
  "lead_audit_log",
  "expense_approval_rules",
  "expense_approval_workflows",
  "expense_categories",
  "expense_groups",
  "expense_group_members",
  "expense_master_config",
  "expense_overrides",
  "expense_policy",
  "gps_tracking",
  "gps_tracking_stops",
  "master_activity_outcomes",
  "master_addresses",
  "master_categories",
  "master_currencies",
  "master_entities",
  "master_event_types",
  "master_industries",
  "master_lead_sources",
  "master_lead_statuses",
  "master_payment_terms",
  "master_products",
  "master_uom",
  "users",
  "profiles",
  "user_roles",
  "user_security_profiles",
  "profile_object_permissions",
];

const BATCH_SIZE = 500;
const ID_PAGE = 1000;
const MAX_DELETE_SWEEP_IDS = 200_000;

type Json = Record<string, unknown>;

function targetHeaders(key: string, extra: Record<string, string> = {}) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function upsertBatch(baseUrl: string, key: string, table: string, rows: Json[]) {
  const res = await fetch(`${baseUrl}/rest/v1/sbee_${table}`, {
    method: "POST",
    headers: targetHeaders(key, {
      Prefer: "resolution=merge-duplicates,return=minimal",
    }),
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`upsert ${table}: ${res.status} ${await res.text()}`);
}

async function fetchTargetIds(baseUrl: string, key: string, table: string): Promise<string[]> {
  const ids: string[] = [];
  let from = 0;
  while (true) {
    const res = await fetch(`${baseUrl}/rest/v1/sbee_${table}?select=id`, {
      headers: targetHeaders(key, { Range: `${from}-${from + ID_PAGE - 1}` }),
    });
    if (!res.ok) throw new Error(`ids ${table}: ${res.status} ${await res.text()}`);
    const page = (await res.json()) as { id: string }[];
    ids.push(...page.map((r) => r.id));
    if (page.length < ID_PAGE) break;
    from += ID_PAGE;
    if (ids.length > MAX_DELETE_SWEEP_IDS) break;
  }
  return ids;
}

async function deleteMissing(
  baseUrl: string,
  key: string,
  table: string,
  sourceIds: Set<string>,
): Promise<number> {
  const targetIds = await fetchTargetIds(baseUrl, key, table);
  const stale = targetIds.filter((id) => !sourceIds.has(id));
  for (let i = 0; i < stale.length; i += 200) {
    const chunk = stale.slice(i, i + 200);
    const list = chunk.map((id) => `"${id}"`).join(",");
    const res = await fetch(`${baseUrl}/rest/v1/sbee_${table}?id=in.(${list})`, {
      method: "DELETE",
      headers: targetHeaders(key, { Prefer: "return=minimal" }),
    });
    if (!res.ok) throw new Error(`delete ${table}: ${res.status} ${await res.text()}`);
  }
  return stale.length;
}

async function mirrorTable(
  supabase: ReturnType<typeof createClient>,
  baseUrl: string,
  key: string,
  table: string,
) {
  let offset = 0;
  let copied = 0;
  const sourceIds = new Set<string>();

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .order("id", { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1);
    if (error) throw new Error(`read ${table}: ${error.message}`);
    const rows = (data ?? []) as Json[];
    if (rows.length === 0) break;

    await upsertBatch(baseUrl, key, table, rows);
    for (const r of rows) sourceIds.add(String(r.id));
    copied += rows.length;

    if (rows.length < BATCH_SIZE) break;
    offset += BATCH_SIZE;
  }

  let deleted = 0;
  if (sourceIds.size <= MAX_DELETE_SWEEP_IDS) {
    deleted = await deleteMissing(baseUrl, key, table, sourceIds);
  }

  return { copied, deleted };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const baseUrl = (Deno.env.get("SBEE_MIRROR_URL") || "").replace(/\/+$/, "");
  const key = Deno.env.get("SBEE_MIRROR_SERVICE_KEY") || "";
  if (!baseUrl || !key) {
    return new Response(
      JSON.stringify({ error: "SBEE_MIRROR_URL or SBEE_MIRROR_SERVICE_KEY not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const url = new URL(req.url);
  const single = url.searchParams.get("table");
  if (single && !TABLES.includes(single)) {
    return new Response(JSON.stringify({ error: "Unknown table" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const tables = single ? [single] : TABLES;

  const startedAt = new Date().toISOString();
  const results: Record<string, unknown> = {};
  let ok = 0;
  let failed = 0;

  for (const table of tables) {
    try {
      results[table] = await mirrorTable(supabase, baseUrl, key, table);
      ok++;
    } catch (e) {
      results[table] = { error: e instanceof Error ? e.message : String(e) };
      failed++;
      console.error(`mirror-to-sbee failed for ${table}:`, e);
    }
  }

  const body = { started_at: startedAt, finished_at: new Date().toISOString(), ok, failed, results };
  console.log("mirror-to-sbee summary", JSON.stringify({ ok, failed }));

  return new Response(JSON.stringify(body, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
