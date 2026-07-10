## Leads & Events Module — Implementation Plan

A new top-level nav item **Leads & Events** with two tabs (Leads | Events), three new master-data lists, business-card OCR via Lovable AI, and a full Lead → Customer/Contact/Opportunity conversion flow that also rolls up activities, attachments, and event association.

---

### 1. Database (single migration)

New tables (all with standard `id`, `created_at`, `updated_at`, RLS + GRANTs):

- `master_event_types` — name, sort_order, is_active
- `master_lead_statuses` — name, color, sort_order, is_active, is_converted_status (bool)
- `master_lead_sources` — name, sort_order, is_active
- `events` — name, event_type_id, budget_amount, actual_amount, start_date, end_date, event_details, expected_end_result, owner_id, customer_id (nullable, filled on conversion rollup)
- `leads` — owner_id, name, title, company, email, phone, website, address, industry, lead_status_id, lead_source_id, related_event_id, converted_customer_id, converted_at, business_card_url
- `lead_audit_log` — lead_id, actor_id, action, from_value, to_value (auto-populated by triggers on insert + status change)

Extend existing tables:

- `customer_activities` → add nullable `lead_id uuid`
- `customer_documents` → add nullable `lead_id uuid`

Seed each new master list with the defaults from the spec (New/Contacted/Qualified/Unqualified/Converted etc.). "Converted" status flagged with `is_converted_status = true`.

RLS: authenticated users can read all; insert/update scoped to owner or admins (mirrors the pattern used in `customer_opportunities`).

### 2. Master Data pages

Following the exact pattern of `src/pages/master/OpportunityTypesMaster.tsx`:

- `src/pages/master/EventTypesMaster.tsx`
- `src/pages/master/LeadStatusesMaster.tsx` (with color picker like Opportunity Stages)
- `src/pages/master/LeadSourcesMaster.tsx`

Register routes in `src/App.tsx` and add three cards to `src/pages/MasterData.tsx` (gated on `module_leads_events`).

### 3. Leads & Events pages

- `src/pages/LeadsEvents.tsx` — shell with `<Tabs>` (Leads | Events), route `/leads-events`
- `src/pages/LeadDetail.tsx` — route `/leads-events/leads/:id`; tabs: Overview | Activities | Attachments | Audit Trail; header "Convert Lead" button
- `src/pages/EventDetail.tsx` — route `/leads-events/events/:id`; shows linked Leads + Activities/Attachments

Components:

- `src/components/leads/LeadForm.tsx` — full form + business-card scan trigger
- `src/components/leads/BusinessCardScanner.tsx` — upload image → call `scan-business-card` edge function → prefill form fields for user review
- `src/components/leads/ConvertLeadDialog.tsx` — the conversion form described in the spec
- `src/components/events/EventForm.tsx`
- Reuse existing `ActivityForm`, `DocumentUpload` (extend to accept `leadId`)

Mobile: reuse `mobile-card` pattern for list views.

### 4. Business-card OCR

New edge function `supabase/functions/scan-business-card/index.ts`:

- Accepts a signed URL or base64 image
- Calls Lovable AI Gateway (`google/gemini-2.5-flash`) with structured output (Zod schema: name, title, company, email, phone, website, address)
- Returns parsed JSON; frontend prefills the Lead form for the user to review before saving

Uses existing `LOVABLE_API_KEY`. Card image stored in the `customer-documents` bucket under `leads/<lead-id>/card.jpg`.

### 5. Convert Lead flow (transactional)

Implemented as a Postgres function `convert_lead(lead_id, payload jsonb)` returning the resulting `customer_id` so the whole conversion is atomic:

1. If `merge_with_existing_customer_id` is set → reuse it; otherwise `INSERT INTO customers` from Account name.
2. `INSERT INTO customer_contacts` from Name/Title/Email/Phone.
3. `INSERT INTO customer_opportunities` (name, type, probability, amount, close_date, stage_id, owner_id).
4. `UPDATE customer_activities SET customer_id = <new>, lead_id = NULL WHERE lead_id = <lead>`.
5. `UPDATE customer_documents SET customer_id = <new> WHERE lead_id = <lead>`.
6. `UPDATE events SET customer_id = <new> WHERE id = <lead.related_event_id>` (rolls the event association up to the account).
7. `UPDATE leads SET converted_customer_id = <new>, lead_status_id = <converted status>, converted_at = now()`.
8. Insert audit-log row.

`ConvertLeadDialog` calls this via `supabase.rpc('convert_lead', …)`, then navigates to `/customers/<new>`. After conversion the Lead detail shows a read-only "Converted → [Customer Name]" link and disables the Convert button.

### 6. Navigation & permissions

- Add `module_leads_events` to `permission_definitions` and to `RolePermissionsMatrix.tsx` whitelist.
- `useProfilePermissions.hasModuleAccess('module_leads_events')` gates the nav item.
- Add item to `src/components/layout/AppHeader.tsx` drawer, `src/pages/More.tsx`, and `ConfigurationWorkflow.tsx` module list.

### 7. Audit trail

Postgres trigger on `leads` (`AFTER INSERT OR UPDATE OF lead_status_id`) writes to `lead_audit_log`. Detail page renders the log as a vertical timeline (reuse Customers Overview timeline styling).

---

### Out of scope for this turn

- Editing the Lead form after conversion (locked read-only)
- Bulk lead import / CSV
- Email/campaign integrations
