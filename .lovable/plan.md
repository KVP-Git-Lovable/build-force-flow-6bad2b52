# Customers & Opportunities Module

A full CRM-style module: Customers (list + detail with 5 tabs), a reusable Opportunity page, and a standalone Opportunities module — all sharing the same data.

## 1. Database (Lovable Cloud)

New tables (all under `public`, RLS on, GRANTs to `authenticated` + `service_role`):

- **customers** — `name`, `industry`, `status`, `owner_id` (→ users), `primary_contact_id` (nullable → customer_contacts).
- **customer_opportunities** — `customer_id`, `name`, `type`, `stage`, `probability` (0–100), `close_date`, `amount`, `owner_id`.
- **opportunity_milestones** — `opportunity_id`, `name`, `invoice_number`, `invoice_date`, `invoice_value`, `status` (Pending/Invoiced/Paid).
- **customer_contacts** — `customer_id`, `name`, `title`, `email`, `phone`, `reports_to_id` (self-FK, builds org chart), `last_contact_at`.
- **customer_activities** — `customer_id`, `opportunity_id` (nullable), `type`, `subject`, `notes`, `activity_date`, `created_by`.
- **customer_documents** — `customer_id`, `opportunity_id` (nullable), `file_name`, `file_url`, `file_size`, `file_type`, `uploaded_by`.
- **Master Data** — extend Master Data with `opportunity_types` and `opportunity_stages` (name + color + sort_order) so admins can edit dropdowns later.
- Storage bucket: `customer-documents` (private, signed URLs).

RLS: any authenticated user can read/write (matches existing modules like Vendors/Procurement). Owner recorded via `auth.uid()`.

## 2. Master Data extension

Add two new sections in `/master-data`:
- **Opportunity Types** — CRUD list (default seeds: Upsell, Renewal, New).
- **Opportunity Stages** — CRUD list with color + sort order (default seeds: Discovery=gray, Proposal=blue, Negotiation=amber, Closed Won=green).

The Opportunity forms read from these tables so the dropdowns stay editable.

## 3. Navigation & Routes

Add two top-level nav items (respect `hasModuleAccess` gating like the rest):
- `module_customers` → `/customers`
- `module_opportunities` → `/opportunities`

Register two new permission definitions in `permission_definitions` so Role Permissions picks them up automatically.

Routes:
- `/customers` — list
- `/customers/:id` — detail with tabs
- `/opportunities` — standalone list/kanban
- `/opportunities/:id` — full opportunity page (shared)

## 4. Customers list page (`/customers`)

- Card grid: name, industry, colored status badge, owner avatar, open-opps count, total pipeline value (sum of open opps).
- Search box + status filter + owner filter.
- "New Customer" button → modal form (Name, Industry, Status, Owner).
- Row click → `/customers/:id`.

## 5. Customer detail page (`/customers/:id`)

**Header:** name, industry, editable status dropdown, and 4 stat tiles — Total Opportunities, Open Pipeline Value, Won Value, Primary Contact.

**Tabs:**

- **Overview** — 4 summary cards (Total Opps, Open Pipeline, Won Value, Last Activity Date) + Recent Activities (5, merged customer+opps) + Recent Documents (5) + Top Contacts preview.
- **Opportunities** — table (Name, Type, Stage badge, Probability, Close Date, Amount) + "New Opportunity" modal (Name, Type, Stage, Probability, Close Date, Amount). Row click → `/opportunities/:id`.
- **Contacts** — toggle List / Org Chart.
  - Add Contact modal (Name, Title, Email, Phone, Reports To — searchable dropdown of this customer's contacts).
  - List View: table.
  - Org Chart View: recursive tree built from `reports_to_id`, horizontally scrollable, rounded avatar-initial cards with name + title, light-gray SVG connectors. (Reference the uploaded screenshot for card style — but with no rating/badge chips since we skip influence scoring.)
  - Below chart: "Contact Relationship Matrix" — Contact, Title, Last Contact only.
- **Activities** — merged customer + all-opportunity timeline, each entry tagged with opportunity name or "General". "+ New Activity" modal (Type, Subject, Notes, Date, optional Opportunity link).
- **Documents** — merged list tagged by source. Upload button, file-type icon, size, uploader, date.

## 6. Opportunity full page (`/opportunities/:id`) — shared

- **a) Overview:** two-column layout — name, customer (linked back to `/customers/:customer_id`), type, stage, probability, close date, amount, owner.
- **b) Payment Milestones:** rolled-up total at top; list of milestones (Name, Invoice #, Invoice Date, Invoice Value, Status badge). "+ Add" modal (Milestone Name, Invoice Value, Invoice Number, Invoice Date; status defaults to Pending, editable inline).
- **c) Activities:** scoped list + "+ New Activity" (Type, Subject, Notes, Date) — automatically shows under parent customer's Activities tab because they share `customer_activities` with `opportunity_id` set.
- **d) Documents:** scoped upload/list — automatically shows under parent customer's Documents tab via `opportunity_id`.

## 7. Standalone Opportunities module (`/opportunities`)

- Summary header: Total Pipeline Value, Weighted Pipeline (Σ amount × probability/100), Won This Quarter.
- View toggle: **Table** (Customer linked, Name, Type, Stage, Probability, Close Date, Amount, Owner) with filters (Stage, Type, Owner, Close Date range).
- **Kanban** view: columns = stages from Master Data, cards = opportunities, drag between columns updates `stage`.
- Row/card click → same `/opportunities/:id` page.

## 8. UI/UX

- Semantic tokens only (matches existing Navy & Gold system) — no hardcoded colors.
- Rounded cards, subtle shadows, colored stage/status badges pulled from Master Data color field.
- Org chart nodes: rounded cards, circular initials avatar, bold name, muted title, gray SVG connectors, horizontal overflow scroll.
- Fully responsive: cards stack on mobile, tabs scroll horizontally, tables become stacked cards on small screens.

## Technical notes

- Hooks: `useCustomers`, `useCustomer(id)`, `useOpportunities(filters?)`, `useOpportunity(id)`, `useOpportunityMilestones`, `useCustomerContacts`, `useCustomerActivities`, `useCustomerDocuments`, `useOpportunityMasterData`.
- Kanban uses existing dnd pattern from `pm/KanbanBoard.tsx`.
- Documents reuse the same signed-URL resolution pattern as `pm-attachments` (per memory note on storage RLS).
- Org chart is a pure React recursive component + SVG connectors — no extra library.
- Permission gating via `useProfilePermissions().hasModuleAccess('module_customers' | 'module_opportunities')` on nav + routes.
- Master Data types/stages seeded on first migration; dropdowns everywhere read from these tables.

## Out of scope

- No influence/relationship-strength scoring on contacts.
- No engagement heatmap or strategy tabs (screenshot is style reference only for the org chart look).
- No changes to existing modules beyond adding two Master Data sections and two nav items.
