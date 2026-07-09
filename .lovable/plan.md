# Configuration & Approval Workflow — Advanced Engine

Enhance the existing `/admin/configuration` page. Keep the sidebar and Configuration / Approval Workflow tab layout. All new features are stored in the existing `app_configuration` table (JSON blobs keyed per module) so no schema migrations are needed.

## 1. Field-Level Configuration ("Manage Fields")

Each module's Configuration tab keeps its current toggle list, plus a new expandable **Manage Fields** section.

**Data model** (stored under `app_configuration` as `<module>.fields`):
```
[
  { id, key, label, type: "text|number|dropdown|date|toggle|file",
    visible: bool, required: bool, builtin: bool, deleted: bool,
    defaultValue, helpText, options?: string[], order: number }
]
```

**Seeded builtin fields** per module (Activities: Check-In, GPS Track, Voice Note, Take Photo, Upload from Gallery, Milestone, etc.), mirroring current toggles. Builtin fields can't be deleted, only hidden.

**UI (`FieldManager.tsx`)**
- Collapsed default view = current toggle list (visibility only)
- "Manage Fields" expand reveals a table with columns: drag-handle · Label · Type · Visible · Required · Actions (edit/delete)
- "+ Add Custom Field" opens dialog: Name, Type, Default, Help Text, Options (for dropdown)
- Edit dialog for rename / retype / re-option custom fields
- Delete on custom field → confirm; if `hasData` flag set, offer **Deactivate** (soft-delete via `deleted: true`) instead of hard remove
- Drag reorder via `@dnd-kit` (already a dep? if not use simple up/down arrows to avoid new deps)

## 2. Approval Workflow Engine ("Build Workflow")

Approval Workflow tab replaced with a **Workflow Builder** stored at `<module>.workflow`:

```
{
  steps: [
    { id, name, approverType: "user|role|reporting_manager",
      approverIds?: uuid[], approverRoles?: string[],
      mode: "sequential|parallel",
      parallelRule?: "all|any" }
  ],
  rules: [
    { id, name,
      conditions: [{ field, op: "eq|neq|gt|lt|gte|lte|contains", value }],
      logic: "AND|OR",
      action: "add_step|skip_to|replace",
      targetStepId?, extraApproverRoles?, extraApproverIds? }
  ]
}
```

**UI (`WorkflowBuilder.tsx`)**
- **Steps list** (vertical, drag-reorderable): each card shows Step Name, Approver Type dropdown, approver picker (roles multiselect or user picker depending on type), Mode toggle (Sequential/Parallel), and Parallel rule (All/Any) when Parallel.
- **+ Add Step** button appends a new empty step.
- **Conditional Rules** section below:
  - "+ Add Rule" opens a visual builder — rows of `[Field ▾] [Op ▾] [Value]` with AND/OR toggle between them, then `THEN [Action ▾] [Target ▾]`.
  - Field dropdown is populated from that module's field list (builtin + custom).
- **Workflow Preview** — collapsible panel rendering a simple flow diagram (CSS/flex, no external lib):
  ```
  [Step 1 · Manager] → [Step 2 · Finance (Any)] → ... 
           └─ IF amount > 10000 → +CFO
  ```

## 3. Shared/Generic Implementation

New files (all reusable across every module):
- `src/lib/configSchemas.ts` — per-module builtin field seeds + available "condition fields"
- `src/components/config/FieldManager.tsx` — field list, add/edit/delete dialogs, reorder
- `src/components/config/FieldEditorDialog.tsx`
- `src/components/config/WorkflowBuilder.tsx` — steps + rules editor
- `src/components/config/WorkflowPreview.tsx` — flow diagram
- `src/components/config/RuleBuilder.tsx` — condition rows + action selector
- Extend `src/hooks/useAppConfiguration.ts` with typed helpers `getFields(module)`, `setFields`, `getWorkflow`, `setWorkflow`

Edit `src/components/config/panels.tsx` so every module's Configuration tab renders existing toggles **plus** `<FieldManager module={m}/>`, and every Approval Workflow tab renders `<WorkflowBuilder module={m}/>` (replacing the current `ApprovalTransitionEditor`, which becomes legacy fallback for procurement's named transitions if needed).

## 4. Runtime Application (scope note)

This ticket delivers the **admin configuration UI + storage**. Wiring individual module forms to read custom fields & execute the workflow engine at submission time is a large separate effort per module; a follow-up ticket will consume `getFields()` / `getWorkflow()` inside each form. Approvers created via the builder are stored and previewable now; enforcement in existing pending-approval flows will be tackled module-by-module afterward.

## Out of scope
- No DB schema changes (uses existing `app_configuration` JSON).
- No changes to existing forms' runtime behavior yet — configuration authoring only.
- No new npm deps unless `@dnd-kit` is missing (fallback: up/down arrows).
