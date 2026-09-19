# Taskovia C1 — Project Cost Overview, Charts & Dedicated Detail UI Implementation Plan

**Document Reference**: `docs/superpowers/plans/2026-09-19-c1-project-cost-overview-detail-ui-implementation.md`
**Author**: Antigravity
**Date**: 2026-09-19
**Branch**: `feat/c1-project-cost-detail-ui-edit`
**Baseline Commit**: `9c15f4f0687661f0a0b47126d1cf6cc7c28607e9` (Remote UI branch and `main` are currently identical at this commit; `aecbac5bab3135b2c58c0576ebf7d56653fb4d5e` is the reconciliation source commit from `feat/c1-project-cost-detail-schema-reconciliation`)
**Status**: APPROVED — PHASE A MIGRATION APPLIED ON CLOUD DEV

---

> [!NOTE]
> ### PHASE A MIGRATION COMPLETE ON CANONICAL CLOUD DEV
> **Target**: Canonical Taskovia Cloud DEV (`gtgljlnhwvhqdnwrfdfj`)
> **Applied Migration**: [`supabase/migrations/20260919143500_c1_project_cost_read_context.sql`](file:///d:/work/company-operations-suite/company-operations-platform/supabase/migrations/20260919143500_c1_project_cost_read_context.sql)
>
> **Security Invariant**:
> - `authenticated` is explicitly permitted to call `public.c1_read_project_cost_read_context`.
> - `anon` and `public` are not permitted.
> - `private.c1_read_project_cost_read_context` worker is revoked from public, anon, and authenticated.
> - `service_role` ACL existence follows the standard platform pattern and is NOT treated as an authorization bypass.
> - The private worker strictly requires `auth.uid()` and asserts actor context via `private.c1_master_context(target_company_id, 'cost.read')`.
> - No application code uses a service-role client for this read path; all operations remain actor-scoped.
> - `company_cost_settings` table RLS is NOT widened and direct table access under `cost.read` remains denied.

---

## 1. Executive Summary & Scope

This plan specifies the implementation for the Taskovia C1 Project Cost UI modernization:
1. **Read-Context RPC Integration (Approval Gated)**: Call `public.c1_read_project_cost_read_context` to validate project accessibility, resolve company timezone, and obtain default currency under `cost.read`. Valid projects with 0 cost items return HTTP 200 with an empty state. Non-existent or inaccessible projects return 404.
2. **Bounded Read-Only Query Architecture**: Deterministic bounded pagination for BOTH parent `project_cost_items` and detail `project_cost_item_details`. Parent items chunked in groups of 50 for detail querying. Minimal overview detail projection omitting `note`, `quantity`, `unit_code`, and `unit_price`.
3. **Dedicated Read DTO Schemas**: Explicit, non-optional enrichment contracts for overview summary, items, and detail responses. Dynamic retention rate display from `retentionRateBps` (no hardcoded 5%). Deterministic latest-date provenance matching detail sort.
4. **Nuxt Charts v2 Integration & Approval Gate**: Pinned `nuxt-charts@2.2.3` (MIT) and `@unovis/ts@1.7.0` (Apache-2.0). Encapsulated in `ProjectCostItemsChart.vue` without fetching or calculating totals. Any fallback to custom charts is strictly approval-gated.
5. **Dedicated Bookmarkable Detail Page**: Route `/costs/:projectId/items/:projectCostItemId` with client pagination (25/50/100), full recognized parent amount card, filtered subtotal notice, project mismatch 404 validation, and full raw notes modal.
6. **Security & Data Safety**: Strict preservation of Auth, RBAC, RLS, `cost.read`, module guard contract (`PERMISSION_DENIED` with `reason: 'MODULE_DISABLED'`), and forward-only applied migrations.

---

## 2. Proposed Migration Contract & Acceptance Criteria

### 2.1 Applied Migration SQL (`supabase/migrations/20260919143500_c1_project_cost_read_context.sql`)
```sql
create function private.c1_read_project_cost_read_context(
  target_company_id uuid,
  target_project_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_context jsonb;
  v_actor_id uuid;
  v_tenant_id uuid;
  v_project record;
  v_settings record;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED'; end if;
  v_context := private.c1_master_context(target_company_id, 'cost.read');
  v_tenant_id := (v_context->>'tenantId')::uuid;
  if (v_context->>'actorId')::uuid is distinct from v_actor_id then raise exception using errcode = 'P0001', message = 'PERMISSION_DENIED'; end if;

  select p.id, p.code, p.name into v_project
  from public.projects p
  where p.tenant_id = v_tenant_id
    and p.company_id = target_company_id
    and p.id = target_project_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'RESOURCE_NOT_FOUND';
  end if;

  select s.default_currency_code, s.money_scale, s.time_zone into v_settings
  from public.company_cost_settings s
  where s.tenant_id = v_tenant_id
    and s.company_id = target_company_id
    and s.enabled = true;

  if not found then
    raise exception using errcode = 'P0001', message = 'MODULE_DISABLED';
  end if;

  return jsonb_build_object(
    'projectId', v_project.id,
    'projectCode', v_project.code,
    'projectName', v_project.name,
    'defaultCurrencyCode', v_settings.default_currency_code,
    'moneyScale', v_settings.money_scale,
    'timeZone', v_settings.time_zone
  );
end;
$$;

create function public.c1_read_project_cost_read_context(
  target_company_id uuid,
  target_project_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.c1_read_project_cost_read_context(target_company_id, target_project_id);
$$;

revoke all on function private.c1_read_project_cost_read_context(uuid, uuid) from public, anon, authenticated;
revoke all on function public.c1_read_project_cost_read_context(uuid, uuid) from public, anon, authenticated;
grant execute on function public.c1_read_project_cost_read_context(uuid, uuid) to authenticated;
```

### 2.2 Migration Acceptance Test Suite (10 Acceptance Points)
Upon user authorization, tests will be added to `tests/unit/server/project-cost-read-context.spec.ts` verifying:
1. Actor with `cost.read` and WITHOUT `cost.config.manage` can successfully invoke `c1_read_project_cost_read_context`.
2. Actor without `cost.read` is rejected with `PERMISSION_DENIED`.
3. Module-disabled company preserves `MODULE_DISABLED` error semantics via the existing guard.
4. Valid same-company project with zero cost items successfully returns project metadata and cost settings.
5. Nonexistent project ID raises `RESOURCE_NOT_FOUND`.
6. Cross-company project ID does not leak metadata and raises `RESOURCE_NOT_FOUND`.
7. Returned `timeZone` and `defaultCurrencyCode` match the database records in `company_cost_settings`.
8. Direct `SELECT` policy on `company_cost_settings` remains restricted to `cost.config.manage` (no policy widening).
9. No service-role bypass path is introduced; actor identity is strictly checked against `auth.uid()`.
10. Existing `c1_read_project_cost_project_metadata` behavior and existing consumers remain completely unaffected.

---

## 3. Dependency Architecture & Licensing

### 3.1 Package Analysis & Rationale
- **Selected Package**: `nuxt-charts@2.2.3` (License: MIT)
- **Chart Engine**: `@unovis/ts@1.7.0` (License: Apache-2.0)
- **Product Constraint Rationale**: Stable Nuxt Charts v2 is the approved product constraint. Nuxt Charts v3 is a prerelease line that replaces Unovis with vccs and alters chart configurations.
- **Pnpm Peer Dependency Resolution**: Declared directly in `package.json` to satisfy peer dependencies under strict package isolation without global `shamefully-hoist`.
- **Approval Gate for Chart Fallback**: Nuxt Charts v2 remains the approved chart library. If an insurmountable issue arises during execution, no ad-hoc fallback will occur; a formal proposal will be presented for approval.

### 3.2 Planned Installation & Configuration
```bash
pnpm add nuxt-charts@2.2.3 @unovis/ts@1.7.0
```
- Module registration in `nuxt.config.ts`:
```ts
modules: [
  "@nuxt/ui",
  "@nuxt/eslint",
  "@pinia/nuxt",
  "nuxt-charts"
]
```

---

## 4. Architecture & Data Contracts

### 4.1 Timezone & Date Provenance Helper (`shared/utils/date-helpers.ts`)
```ts
export function deriveEffectiveDate(
  relevantDate: string | null | undefined,
  createdAtIso: string,
  timeZone: string = 'Asia/Ho_Chi_Minh'
): { effectiveDate: string; dateSource: 'relevant_date' | 'created_at' } {
  if (relevantDate && /^\d{4}-\d{2}-\d{2}$/.test(relevantDate)) {
    return { effectiveDate: relevantDate, dateSource: 'relevant_date' }
  }
  const date = new Date(createdAtIso)
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return { effectiveDate: formatter.format(date), dateSource: 'created_at' }
}

export function getDateSourceLabel(source: 'relevant_date' | 'created_at' | null | undefined): string {
  if (source === 'relevant_date') return 'Ngày phát sinh'
  if (source === 'created_at') return 'Ngày nhập hệ thống'
  return ''
}

export function formatDynamicRetentionRate(retentionRateBps: number | null | undefined): string {
  if (retentionRateBps === null || retentionRateBps === undefined) return 'Bảo hành'
  const rate = retentionRateBps / 100
  return `${Number.isInteger(rate) ? rate : rate.toFixed(1)}% BH`
}
```

### 4.2 Strengthened Read DTO Schemas (`shared/schemas/costs/project-costs.ts`)

#### Dedicated Overview Summary Schema:
```ts
export const projectCostOverviewSummarySchema = z.object({
  currencyCode,
  acceptedValue: decimalStringSchema,
  acceptedCount: z.number().int().nonnegative(),
  inProgressValue: decimalStringSchema,
  inProgressCount: z.number().int().nonnegative(),
  unknownStatusValue: decimalStringSchema,
  unknownCount: z.number().int().nonnegative(),
  totalTrackedWorkValue: decimalStringSchema,
  warrantyRetentionValue: decimalStringSchema,
  warrantyRetentionDetailCount: z.number().int().nonnegative(),
}).strict().superRefine((value, context) => {
  if (!new Decimal(value.acceptedValue).plus(value.inProgressValue).eq(value.totalTrackedWorkValue)) {
    context.addIssue({ code: 'custom', path: ['totalTrackedWorkValue'], message: 'must equal acceptedValue plus inProgressValue' })
  }
})
export type ProjectCostOverviewSummary = z.infer<typeof projectCostOverviewSummarySchema>
```

#### Dedicated Item Read Model Schema (Required Enrichment):
```ts
export const projectCostItemReadSchema = projectCostItemSchema.extend({
  detailCount: z.number().int().nonnegative(),
  latestDetailDate: z.string().date().nullable(),
  latestDetailDateSource: z.enum(['relevant_date', 'created_at']).nullable(),
  warrantyRetentionAmount: decimalStringSchema,
  warrantyRetentionDetailCount: z.number().int().nonnegative(),
}).strict()
export type ProjectCostItemRead = z.infer<typeof projectCostItemReadSchema>

export const projectCostBreakdownSchema = projectCostProjectMetadataSchema.extend({
  summary: projectCostOverviewSummarySchema,
  items: z.array(projectCostItemReadSchema),
}).strict()
export type ProjectCostBreakdown = z.infer<typeof projectCostBreakdownSchema>
```

#### Dedicated Enriched Detail Row Schema:
```ts
export const projectCostItemDetailReadSchema = z.object({
  id: uuid,
  projectCostItemId: uuid,
  lineNo: z.number().int().positive(),
  detailKind: projectCostDetailKindSchema,
  description: text,
  quantity: decimalStringSchema.nullable(),
  unitCode: z.string().nullable(),
  unitPrice: decimalStringSchema.nullable(),
  amount: decimalStringSchema,
  retentionKind: projectCostRetentionKindSchema.nullable(),
  retentionRateBps: z.number().int().min(0).max(10000).nullable(),
  retentionAmount: decimalStringSchema.nullable(),
  relevantDate: relevantDate.nullable(),
  effectiveDate: z.string().date(),
  dateSource: z.enum(['relevant_date', 'created_at']),
  reference: z.string().nullable(),
  note: z.string().nullable(),
  version,
  createdAt: timestamp,
  updatedAt: timestamp,
}).strict()
export type ProjectCostItemDetailRead = z.infer<typeof projectCostItemDetailReadSchema>
```

#### Dedicated Details Response Schema:
```ts
export const projectCostDetailsResponseSchema = z.object({
  projectCostItemId: uuid,
  projectId: uuid,
  projectCode: text,
  projectName: text,
  itemDescription: text,
  itemStatus: projectCostWorkStatusSchema,
  itemReference: text.nullable(),
  totalAmount: decimalStringSchema,
  currencyCode,
  warrantyRetentionTotal: decimalStringSchema,
  warrantyRetentionCount: z.number().int().nonnegative(),
  otherRetentionTotal: decimalStringSchema,
  otherRetentionCount: z.number().int().nonnegative(),
  latestDetailDate: z.string().date().nullable(),
  latestDetailDateSource: z.enum(['relevant_date', 'created_at']).nullable(),
  details: z.array(projectCostItemDetailReadSchema),
}).strict()
export type ProjectCostDetailsResponse = z.infer<typeof projectCostDetailsResponseSchema>
```

---

## 5. Query Architecture, Bounded Pagination & Concurrency Guard

### 5.1 Overview Endpoint Execution Flow
1. **Single Frontend Call**: Exactly 1 HTTP request from the browser.
2. **Context Resolution (1 RPC call)**:
   - Call `c1_read_project_cost_read_context(companyId, projectId)`.
   - If project not found $\rightarrow$ throws 404 `RESOURCE_NOT_FOUND`.
   - If module disabled $\rightarrow$ throws 403 `PERMISSION_DENIED` with `{ reason: 'MODULE_DISABLED' }`.
   - Context yields: `projectId`, `projectCode`, `projectName`, `defaultCurrencyCode`, `moneyScale`, `timeZone`.
3. **Bounded Parent Item Reads**:
   - Read `project_cost_items` in deterministic pages of 500 rows ordered by `created_at ASC, id ASC`.
   - Repeated loop until `batch.length < 500`.
   - **Zero-Cost-Items Handling**: If 0 parent rows returned, return valid 200 response with `summary` (all zeroes, `currencyCode = context.defaultCurrencyCode`) and `items = []`.
4. **Item Chunking & Bounded Detail Reads**:
   - Partition parent `itemIds` into chunks of 50 items.
   - Minimal projection: `.select('id, project_cost_item_id, line_no, amount, retention_kind, retention_rate_bps, retention_amount, relevant_date, created_at')`.
   - For each 50-item chunk, paginate details in batches of 500 rows ordered by `project_cost_item_id ASC, id ASC` until terminal page.
5. **Deterministic Latest-Date Provenance**:
   - For each parent item, sort fetched details deterministically:
     `effectiveDate DESC, createdAt DESC, lineNo ASC, id ASC`.
   - Derive `latestDetailDate` and `latestDetailDateSource` directly from the top sorted detail row.
6. **Post-Pagination Financial Consistency Guard**:
   - Verify $\sum \text{detail.amount} == \text{parent.amount}$ for all parent items.
   - If a discrepancy occurs (due to concurrent write during pagination), initiate bounded retry of the aggregation (max 2 attempts, 50ms backoff).
   - If discrepancy persists, throw:
     ```ts
     new AppApiError(
       500,
       'INTERNAL_ERROR',
       'Dữ liệu chi phí đang được cập nhật, vui lòng thử lại sau giây lát.',
       { reason: 'DATA_CONSISTENCY_ERROR' }
     )
     ```
7. **Query Accounting Model**:
   - Exactly 1 frontend HTTP request.
   - Backend queries: `1 read-context RPC + N parent pages + sum(detail pages per item-ID chunk)`.
   - No separate direct settings read; no separate legacy metadata RPC.

### 5.2 Dedicated Item Detail Endpoint Execution Flow
1. **Ownership Check**:
   - Read parent item by ID under `tenant_id` and `company_id`.
   - Validate route `projectId`: If `parent.project_id !== projectId`, throw `AppApiError(404, 'RESOURCE_NOT_FOUND', 'Hạng mục chi phí không thuộc dự án chỉ định.')`.
2. **Context Resolution**:
   - Call `c1_read_project_cost_read_context(companyId, projectId)` to get project metadata and `timeZone`.
3. **Detail Pagination & Invariant Check**:
   - Paginate all detail rows for the item in 500-row chunks ordered by `line_no ASC, id ASC`.
   - Validate $\sum \text{detail.amount} == \text{parent.amount}$.
4. **Enrichment & Sorting**:
   - Derive `effectiveDate` (using company timezone) and `dateSource`.
   - Default sort newest-first (`effectiveDate DESC, createdAt DESC, lineNo ASC, id ASC`).
   - Calculate `warrantyRetentionTotal` and `otherRetentionTotal`.

---

## 6. UI Component Hierarchy & Interaction Contracts

| Component Path | Responsibility & Interaction Contracts | Key Props & Events |
|---|---|---|
| `app/components/costs/ProjectCostKpiCards.vue` | 4 headline cards + separate unknown status notice. Full project metrics (unaffected by table search/filter). | `props: { summary: ProjectCostOverviewSummary, currencyCode: string }` |
| `app/components/costs/ProjectCostItemsChart.vue` | Horizontal bar chart wrapper. Zero-based axis, descending sort ($V_1 \ge V_2$), exact decimal strings in tooltips, full item name, text status legend, keyboard accessible. Does not fetch data or compute totals. Supports empty data, single item, many items, and all-zero amounts. | `props: { items: ProjectCostChartItem[], projectId: string, currencyCode: string }`, `emits: { select: (id: string) => void }` |
| `app/components/costs/ProjectCostItemsTable.vue` | Filterable items table. Filters affect ONLY this table. Contains explicit "Xem chi tiết" links to dedicated detail page. Dynamic retention badge (`% BH`). | `props: { items: ProjectCostItemRead[], projectId: string, currencyCode: string }` |
| `app/components/costs/ProjectCostDetailHeader.vue` | Dedicated page header: project identity, item description, status, reference, return link, and authoritative full parent amount card. | `props: { detail: ProjectCostDetailsResponse, projectId: string, currencyCode: string }` |
| `app/components/costs/ProjectCostDetailList.vue` | Keyword search (description & reference), date range filter, retention filter (all / warranty / other / none), sort toggle, filtered subtotal notice, client pagination (25/50/100), desktop table & 390px stacked cards. Compact note preview. | `props: { details: ProjectCostItemDetailRead[], currencyCode: string }`, `emits: { viewNote: (d: ProjectCostItemDetailRead) => void }` |
| `app/components/costs/ProjectCostNotesModal.vue` | Accessible dialog displaying complete raw unparsed notes and provenance metadata. Dismissible via Escape key. Raw notes are never parsed to infer business facts. | `props: { detail: ProjectCostItemDetailRead | null, open: boolean }`, `emits: { close: () => void }` |

---

## 7. Sequential Implementation Tasks (Post-Approval)

### Phase 0: Forward Migration (Blocked on Authorization)
- **Task 0.1**: Apply migration `c1_read_project_cost_read_context` to Cloud DEV using `pnpm db:dev:push`.
- **Task 0.2**: Run `pnpm db:dev:types` to regenerate database types.
- **Task 0.3**: Execute migration acceptance test suite (10 points in Section 2.2).

### Phase 1: Shared Utilities & Strengthened DTO Schemas
- **Task 1.1**: Create `shared/utils/date-helpers.ts` with `deriveEffectiveDate` (using company timezone parameter), `getDateSourceLabel`, `formatDynamicRetentionRate`, and date formatters.
- **Task 1.2**: Define dedicated schemas in `shared/schemas/costs/project-costs.ts`: `projectCostOverviewSummarySchema`, `projectCostItemReadSchema`, `projectCostBreakdownSchema`, `projectCostItemDetailReadSchema`, `projectCostDetailsResponseSchema`.
- **Task 1.3**: Add unit tests in `tests/unit/shared/date-helpers.spec.ts` and `tests/unit/costs/project-costs.spec.ts`.

### Phase 2: Backend Repository & Service
- **Task 2.1**: Implement `ProjectCostRepository.projectSummary` calling `c1_read_project_cost_read_context`. Support valid project with 0 cost items (clean 200 response with zero summary and empty items array) and 404 for non-existent/foreign projects.
- **Task 2.2**: Implement bounded pagination for parent items (500/page) and item-ID chunking (50 items/chunk) with bounded detail pagination (500/page).
- **Task 2.3**: Enforce minimal detail projection (`id, project_cost_item_id, line_no, amount, retention_kind, retention_rate_bps, retention_amount, relevant_date, created_at`).
- **Task 2.4**: Implement deterministic latest-date source selection and post-pagination consistency guard with bounded retry and `INTERNAL_ERROR` (`reason: 'DATA_CONSISTENCY_ERROR'`).
- **Task 2.5**: Implement `ProjectCostRepository.itemDetails` with `projectId` mismatch check (404), read-context resolution, bounded detail pagination, dynamic retention aggregation, and newest-first sort.
- **Task 2.6**: Update `server/features/costs/project-cost.service.ts` and `server/features/costs/project-cost.routes.ts`. Add unit tests in `tests/unit/server/project-cost.service.spec.ts`.

### Phase 3: Client Repositories & Chart Wrapper
- **Task 3.1**: Install pinned packages `nuxt-charts@2.2.3` and `@unovis/ts@1.7.0`, register in `nuxt.config.ts`.
- **Task 3.2**: Update `app/repositories/contracts.ts` and `app/repositories/http/http-project-cost-repository.ts` with `options.projectId`.
- **Task 3.3**: Implement `ProjectCostItemsChart.vue` with horizontal orientation, zero-based axis, descending sort, exact money tooltips, text status legend, empty data, single-item, many-item, and keyboard navigation.
- **Task 3.4**: Add unit tests in `tests/unit/costs/project-cost-chart.spec.ts`.

### Phase 4: Overview Page Restructuring (`/costs/:projectId`)
- **Task 4.1**: Migrate `app/pages/costs/[projectId].vue` to `app/pages/costs/[projectId]/index.vue`.
- **Task 4.2**: Implement `ProjectCostKpiCards.vue` and `ProjectCostItemsTable.vue`. Handle `MODULE_DISABLED` via `PERMISSION_DENIED` with `reason: 'MODULE_DISABLED'`.
- **Task 4.3**: Integrate chart, ensuring 4-KPI cards and chart represent full-project totals independent of table search/filter. Support 0-item empty state.

### Phase 5: Dedicated Item Detail Page (`/costs/:projectId/items/:projectCostItemId`)
- **5.1**: Create `app/pages/costs/[projectId]/items/[projectCostItemId].vue`.
- **5.2**: Implement `ProjectCostDetailHeader.vue`, `ProjectCostDetailList.vue`, and `ProjectCostNotesModal.vue`.
- **5.3**: Implement keyword search, date range filter, retention filter, newest/oldest sort toggle, filtered subtotal notice, client pagination (25/50/100), compact note preview with modal, and mobile 390px stacked cards.
- **5.4**: Add contract tests in `tests/unit/costs/project-cost-ui-contracts.spec.ts`.

### Phase 6: E2E Playwright Tests & Delivery Verification
- **6.1**: Update `tests/e2e/project-costs.spec.ts` covering chart isolation, table-to-detail navigation, direct URL reload, parent mismatch 404, 0-item empty state, filtered subtotal, notes modal, and 390px mobile view.
- **6.2**: Execute formal verification suite: `pnpm test:unit`, `pnpm test:e2e`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `git diff --check`, and measure client chart chunk.

---

## 8. Requirement Traceability Matrix (T01 – T20)

*Note: All acceptance cases remain Planned / Not yet accepted until formal implementation verification.*

| ID | Requirement / Acceptance Case | Owning Task | Test File | Planned Verification Strategy | Status |
|---|---|---|---|---|:---:|
| **T01** | EO GIÓ 5 items vs Yong Mei 4 items; no cross-project mixing in chart | Task 4.3, 6.1 | `tests/e2e/project-costs.spec.ts` | Assert chart bar count equals project items; 0 foreign items | Planned |
| **T02** | Horizontal, zero-based, amount-sorted chart ($V_1 \ge V_2$); text legend; long labels; empty/all-zero/single/many cases | Task 3.3, 6.1 | `tests/unit/costs/project-cost-chart.spec.ts` | Unit tests for chart props, sorting, tooltips, edge-case rendering | Planned |
| **T03** | Unknown status separated from tracked total, visibly disclosed in notice | Task 1.2, 4.2 | `tests/unit/costs/project-costs.spec.ts` | Assert `totalTrackedWorkValue == accepted + inProgress`; notice rendered if `unknownCount > 0` | Planned |
| **T04** | Warranty/other retention separate; retention never alters recognized costs; dynamic `% BH` from bps | Task 1.1, 2.5 | `tests/unit/server/project-cost.service.spec.ts` | Verify $\sum \text{detail.amount} == \text{parent.amount}$; dynamic rate format (500bps -> 5% BH) | Planned |
| **T05** | Distinction between no-recorded-retention ("Chưa ghi nhận") and valid 0 amount ("0 VND") | Task 4.2, 5.2 | `tests/unit/costs/project-costs.spec.ts` | Assert count 0 -> "Chưa ghi nhận"; count > 0 & amount 0 -> "0 VND" | Planned |
| **T06** | 1 overview HTTP request; bounded parent pagination; item chunking (50/chunk); minimal detail projection; no N+1 loop | Task 2.1-2.3 | `tests/unit/server/project-cost.service.spec.ts` | Assert 1 frontend call; backend uses chunked batches; minimal columns selected | Planned |
| **T07** | Complete aggregation beyond single page; repeated range loop (500/page); post-pagination consistency guard & retry | Task 2.2, 2.4 | `tests/unit/server/project-cost.service.spec.ts` | Test multi-page aggregation; simulated concurrent change triggers bounded retry | Planned |
| **T08** | Direct/reloaded item URL works; parent-project mismatch 404 rejected; valid project with 0 items returns 200 empty | Task 2.1, 2.5, 5.1 | `tests/unit/server/project-cost.service.spec.ts` | Route `projectId` mismatch throws 404; direct reload succeeds; 0-item project returns clean 200 | Planned |
| **T09** | Newest-first sort, same-day ties, company timezone fallback, deterministic latest-date source | Task 1.1, 2.4 | `tests/unit/shared/date-helpers.spec.ts` | Assert sort: `effectiveDate DESC, createdAt DESC, lineNo ASC, id ASC`; latest source matches top row | Planned |
| **T10** | Invalid raw date remains in note, not fabricated business date | Task 1.1, 2.5 | `tests/unit/shared/date-helpers.spec.ts` | Raw string "31/09/2026" keeps `relevantDate: null` and appears in note | Planned |
| **T11** | Keyword/date/retention filters, newest/oldest sort toggle, page reset, full vs filtered totals | Task 5.3, 6.1 | `tests/e2e/project-costs.spec.ts` | Filter resets page to 1; subtotal labeled "Giá trị theo bộ lọc" distinct from parent total | Planned |
| **T12** | Parent with zero details renders allowed empty state without hiding amount | Task 2.5, 5.3 | `tests/unit/server/project-cost.service.spec.ts` | Item with 0 details returns empty details array and valid parent `totalAmount` | Planned |
| **T13** | Company switcher invalidates state and ignores stale responses | Task 4.1, 5.1 | `tests/e2e/project-costs.spec.ts` | Switch company during load; old response discarded, state refreshed | Planned |
| **T14** | Large/fractional decimals exact; chart coordinates stay finite | Task 1.2, 3.3 | `tests/unit/costs/project-cost-chart.spec.ts` | Exact decimal strings in tooltips; finite `Number` used for bar geometry | Planned |
| **T15** | Opening-balance badge supported without inventing expenditure | Task 1.2, 5.3 | `tests/unit/costs/project-costs.spec.ts` | `detailKind: 'opening_balance'` renders "Số liệu ban đầu" badge | Planned |
| **T16** | Desktop & 390px views: no overflow, keyboard access, 44px targets | Task 5.3, 6.1 | `tests/e2e/project-costs.spec.ts` | Viewport 390px test: 0 horizontal scrollbar, 44px min touch targets | Planned |
| **T17** | Light/dark theme tokens; color not sole status indicator | Task 3.3, 6.1 | `tests/unit/costs/project-cost-chart.spec.ts` | Text labels accompanied by status colors | Planned |
| **T18** | Module-disabled (`PERMISSION_DENIED` + reason `MODULE_DISABLED`), permission, not-found, empty, error/retry states | Task 4.1, 5.1 | `tests/unit/costs/project-cost-ui-contracts.spec.ts` | Test all 7 UI state machine conditions with standard error contracts | Planned |
| **T19** | Applied migrations & write command semantics untouched; actor-scoped reads | Repository check | `tests/unit/config/c1-project-cost-detail-schema-reconciliation-contract.spec.ts` | Verification pass with untouched migrations and RLS compliance | Planned |
| **T20** | Measured chart client chunk and full suite verification reported | Task 6.2 | Verification log & build artifact | Report client chart chunk size and verification results | Planned |

---

### 8.1 Prototype Verification Evidence (Unapproved Working-Tree Prototype)

During development of the planning artifacts, checks were executed against the working-tree prototype to validate feasibility:
- **Unit & Contract Tests**:
  - `pnpm test:unit` -> **133 passed (133 files, 1,078 tests)**. Duration: 18.37s. Exit code: 0.
  - `pnpm vitest run tests/unit/costs/project-cost-ui-contracts.spec.ts` -> **6/6 passed**. Exit code: 0.
  - `pnpm vitest run tests/unit/costs/project-cost-chart.spec.ts` -> **5/5 passed**. Exit code: 0.
  - `pnpm vitest run tests/unit/costs/project-costs.spec.ts` -> **38/38 passed**. Exit code: 0.
  - `pnpm vitest run tests/unit/server/project-cost.service.spec.ts` -> **47/47 passed**. Exit code: 0.
- **Typecheck & Lint**:
  - `pnpm typecheck` -> Clean pass, 0 errors. Exit code: 0.
  - `pnpm lint` -> Clean pass, 0 errors, 0 warnings. Exit code: 0.
  - `git diff --check` -> Clean pass, 0 trailing whitespace/newline issues. Exit code: 0.
- **Production Build**:
  - `pnpm build` -> Nitro build complete. Total bundle: 8.33 MB (2.2 MB gzip). Exit code: 0.
- **Database Status**:
  - `pnpm db:dev:status` -> 45 migrations verified in sync on Cloud DEV up to `20260918102344`. Exit code: 0.
- **Playwright E2E Status**:
  - Full Playwright browser execution (`pnpm test:e2e`) is reserved for the formal execution phase following planning approval.

---

## 9. Verification Plan for Formal Implementation Phase

Following migration authorization and planning approval, the following explicit verification matrix and commands will be executed to claim delivery:

### 9.1 Automated Unit & Contract Test Suite
Execute the repository unit test suite and specialized contract suites:
```bash
# Full unit test suite
pnpm test:unit

# Targeted contract & service suites
pnpm vitest run tests/unit/costs/project-costs.spec.ts
pnpm vitest run tests/unit/costs/project-cost-ui-contracts.spec.ts
pnpm vitest run tests/unit/costs/project-cost-chart.spec.ts
pnpm vitest run tests/unit/shared/date-helpers.spec.ts
pnpm vitest run tests/unit/server/project-cost.service.spec.ts
pnpm vitest run tests/unit/server/project-cost-read-context.spec.ts
```

### 9.2 End-to-End (Playwright) Verification Suite
Execute dedicated Playwright scenarios against a live preview server:
```bash
pnpm exec playwright test tests/e2e/project-costs.spec.ts
```
**Specific Flows Verified in E2E**:
- **Chart scope isolation & edge cases (T01, T02)**: EO GIÓ 5 items vs Yong Mei 4 items; horizontal bar orientation; textual status legend; empty chart; all-zero values; single-item project; many-item project.
- **Chart interaction & keyboard navigation (T02)**: Clicking horizontal bar navigates to `/costs/:projectId/items/:id`; keyboard focus (`Tab` + `Enter`/`Space`) triggers identical navigation.
- **Unknown status notice (T03)**: Notice banner renders below KPI cards when `unknownCount > 0` and is excluded from `totalTrackedWorkValue`.
- **Dedicated item detail direct load / reload (T08)**: Direct browser navigation and page refresh at `/costs/:projectId/items/:projectCostItemId` succeeds autonomously without prior overview cache.
- **Cross-project mismatch rejection (T08)**: Direct navigation with invalid `projectId` (e.g. EO GIÓ projectId paired with Yong Mei item ID) renders 404 Not Found state.
- **Valid 0-cost-item project empty state (T08)**: Direct navigation to a valid project with 0 cost items renders clean 200 empty state with company default currency.
- **Detail filtering, pagination & subtotal separation (T11)**: Applying keyword, date, or retention filter updates the "Giá trị theo bộ lọc" subtotal without altering the parent total in the header; resets page to 1.
- **Company switcher invalidation & stale response drop (T13)**: Switching company mid-load invalidates in-flight requests and refreshes data cleanly.
- **Mobile responsiveness & touch targets (T16)**: Viewport set to 390px (iPhone 12/13/14); assert 0 horizontal page overflow, stacked card layout, and touch targets $\ge 44 \times 44\text{px}$.
- **Accessibility & Escape modal dismissal (T16, T18)**: Raw notes modal opens on button click and closes cleanly via `Escape` key; ARIA roles and labels validated.
- **Visual Artifacts & Screenshots**:
  - `test-results/gate-g-desktop-overview.png` (Desktop 1280px overview with chart & KPI cards)
  - `test-results/gate-g-mobile-390px-overview.png` (Mobile 390px overview with stacked layout)
  - `test-results/gate-g-desktop-detail.png` (Desktop 1280px item detail table & header)
  - `test-results/gate-g-mobile-390px-detail.png` (Mobile 390px item detail cards)

### 9.3 Static Analysis, Lint & Code Hygiene
```bash
pnpm typecheck
pnpm lint
git diff --check
```

### 9.4 Production Build & Client Chart Chunk Measurement
```bash
pnpm build
```
Locate and record the isolated client chart chunk size:
`ls -lh .output/public/_nuxt/ProjectCostItemsChart.*.js`

### 9.5 Database Safety & Migration Audit
```bash
pnpm db:dev:status
```
- Verify Cloud DEV database status.

---

## 10. Security Boundaries & Rollback Strategy

1. **Security Boundaries Preserved**:
   - **Auth & RBAC**: Required permission remains `cost.read`.
   - **RLS**: Direct access to `company_cost_settings` table remains restricted to `cost.config.manage`. Reading settings for `cost.read` occurs strictly via the authorized read-context RPC.
   - **Actor-Scoped Execution**: Queries execute strictly via `UserSupabaseClient` with no service-role bypass.
   - **Company & Tenant Isolation**: Every query filters on both `tenant_id` and `company_id`.
   - **Database Safety**: Single forward-only read-only migration; zero schema mutations on existing tables; zero write command alterations.
2. **Git Isolation**: All work is staged on `feat/c1-project-cost-detail-ui-edit`. If the planning review requires an alternative approach, the branch can be rolled back to `9c15f4f0687661f0a0b47126d1cf6cc7c28607e9` without affecting `main`.
3. **Approval-Gated Chart Engine Fallback**: Nuxt Charts v2 remains the approved chart library. If an insurmountable issue arises during execution, no ad-hoc fallback will occur; a formal proposal will be presented for approval.
