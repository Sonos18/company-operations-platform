# Taskovia C1 — Project Cost Overview & Dedicated Item Detail UI Specification

**Document Reference**: `docs/superpowers/specs/2026-09-19-c1-project-cost-overview-detail-ui-design.md`
**Author**: Antigravity
**Date**: 2026-09-19
**Branch**: `feat/c1-project-cost-detail-ui-edit`
**Baseline Commit**: `9c15f4f0687661f0a0b47126d1cf6cc7c28607e9` (Remote UI branch and `main` are currently identical at this commit; `aecbac5bab3135b2c58c0576ebf7d56653fb4d5e` is the reconciliation source commit from `feat/c1-project-cost-detail-schema-reconciliation`)
**Status**: SPECIFICATION APPROVED — PHASE A MIGRATION APPLIED ON CLOUD DEV

---

> [!NOTE]
> **PHASE A MIGRATION COMPLETED ON CANONICAL CLOUD DEV**:
> Migration `20260919143500_c1_project_cost_read_context.sql` has been created, verified, and applied to canonical Taskovia Cloud DEV (`gtgljlnhwvhqdnwrfdfj`).
>
> **Security Invariant**:
> - `authenticated` is explicitly permitted to call public RPC `public.c1_read_project_cost_read_context`.
> - `anon` and `public` are not permitted.
> - `private.c1_read_project_cost_read_context` worker is revoked from public, anon, and authenticated.
> - `service_role` ACL existence follows the standard platform pattern and is NOT treated as an authorization bypass.
> - The private worker strictly requires `auth.uid()` and asserts actor context via `private.c1_master_context(target_company_id, 'cost.read')`.
> - No application code uses a service-role client for this read path; all operations remain actor-scoped.
> - `company_cost_settings` table RLS is NOT widened and direct table access under `cost.read` remains denied.

---

## 1. Overview & Business Objectives

### 1.1 Problem Statement
In the Taskovia Cockpit, project managers, directors, and finance leaders need to rapidly understand project expenditures, compare major work items by magnitude, track work delivery progress (accepted vs. in-progress), and monitor warranty retention obligations. The previous implementation nested full detail tables inside expandable accordion rows of the overview table. This created visual clutter, page stuttering, poor mobile readability, and prevented direct sharing, deep linking, or bookmarking of specific cost items.

### 1.2 Core Objectives
1. **Clear Project-Level Cost Cockpit**: Display headline KPI cards and an interactive horizontal bar chart comparing items of the currently viewed project, enabling instant identification of cost drivers.
2. **Dedicated Item Detail Route**: Replace nested accordions with a bookmarkable, directly navigable detail page (`/costs/:projectId/items/:projectCostItemId`) providing fast filtering, sorting, pagination, and readable source note disclosure.
3. **Truthful Financial and Date Semantics**:
   - Strictly separate additive recognized costs (`accepted` + `in_progress`) from separate warranty retention tracking.
   - Maintain the financial invariant $\text{totalTrackedWorkValue} = \text{acceptedValue} + \text{inProgressValue}$.
   - Distinctly disclose unknown-status items without distorting the tracked total.
   - Display dates with clear provenance (`effectiveDate` derived from `relevantDate` or visibly labeled as "Ngày nhập hệ thống" when falling back to `createdAt` formatted in the company's configured timezone).
4. **Strict Scope & Security Isolation**: Maintain multi-company and project isolation. Never mix projects (e.g., EO GIÓ 5 items vs. Yong Mei 4 items). All reads remain strictly actor-scoped under `cost.read` with no service-role bypass and no widening of table RLS.
5. **Cockpit Visual Integration**: Seamlessly conform to the Taskovia Cockpit Design System (Inter / Manrope typography, 18px card radius, semi-transparent slate surfaces, 44px touch targets).

---

## 2. Information Architecture & Navigation

### 2.1 Route Map
```
/costs
  └── /costs/:projectId (Project Overview Page)
        ├── Breadcrumb / Back to List ("← Quay lại danh sách chi phí dự án")
        ├── Project Identity (Name, Code pill)
        ├── 4 Headline KPI Cards (+ Separate Unknown Status Notice)
        ├── Horizontal Bar Chart ("Giá trị theo hạng mục công việc")
        └── Project Cost Items Table (Filterable, Searchable)
              └── "Xem chi tiết" Link (Explicit NuxtLink / Keyboard accessible)
                    └── /costs/:projectId/items/:projectCostItemId (Dedicated Detail Page)
                          ├── Breadcrumbs ("Danh sách chi phí / [Tên dự án] / [Tên hạng mục]")
                          ├── Back to Overview Link ("← Quay lại tổng quan chi phí dự án")
                          ├── Item Header & Retention Summary Cards (Full Parent Amount)
                          ├── Search & Filter Toolbar (Keyword, Retention, Date range, Sort, Page size)
                          ├── Filtered Subtotal Notice (When filter active, clearly distinct from parent total)
                          ├── Detail Rows (Desktop Table / Mobile 390px Stacked Cards)
                          ├── Client Pagination Controls (25 / 50 / 100 rows per page)
                          └── Full Raw Notes Modal (Keyboard dismissible via Escape)
```

### 2.2 Route File Organization
- `app/pages/costs/[projectId]/index.vue`: Replaces legacy `app/pages/costs/[projectId].vue` to prevent Nuxt 4 route collisions with nested item sub-pages.
- `app/pages/costs/[projectId]/items/[projectCostItemId].vue`: Dedicated item detail view.
- Both routes enforce `definePageMeta({ requiredPermission: 'cost.read' })`.
- Direct URL deep reload (`/costs/:projectId/items/:projectCostItemId`) functions autonomously without relying on overview page cache or unrelated project permissions.

---

## 3. Financial Invariants & Business Logic

### 3.1 Headline KPI Definitions (FIN-01, FIN-02, FIN-04)

| Card Title | Formula / Source | Meaning | Visual Treatment |
|---|---|---|---|
| **Tổng đang theo dõi** | `acceptedValue + inProgressValue` | Primary operational recognized work value. | Neutral primary (`--color-text-primary`) |
| **Đã nghiệm thu** | $\sum \text{amount}$ for `workStatus == 'accepted'` | Formally inspected and accepted work. Displays item count `(N)`. | Success Green (`cockpit-badge--success`) |
| **Đang thực hiện** | $\sum \text{amount}$ for `workStatus == 'in_progress'` | Active construction or procurement work. Displays item count `(N)`. | Warning Amber (`cockpit-badge--warning`) |
| **Bảo hành giữ lại** | $\sum \text{retentionAmount}$ for `retentionKind == 'warranty'` | Recorded warranty retention held back. Displays detail row count `(N)`. | Info Indigo (`cockpit-badge--info`) |

#### Strict Non-Additive Invariant:
$$\text{totalTrackedWorkValue} = \text{acceptedValue} + \text{inProgressValue}$$
- Warranty retention is **NOT** an additive 5th category and must **NEVER** add to or subtract from recognized project costs.
- Other retention (`retentionKind == 'other'`) is tracked separately as "Khoản giữ lại khác" and is **NEVER** labeled as warranty retention.

### 3.2 Dynamic Retention Basis Points (No Hardcoded 5%)
- Basis points in `retentionRateBps` must be rendered dynamically:
  - `500 bps` $\rightarrow$ "5% BH"
  - `250 bps` $\rightarrow$ "2.5% BH"
  - Dynamic formula: `${retentionRateBps / 100}% BH`
- If `retentionKind === 'warranty'` but `retentionRateBps` is null, display the label **"Bảo hành"** without inventing a percentage.
- If `retentionKind === 'other'`, label it **"Khoản giữ lại khác"**, never warranty.
- State distinctions:
  - `retentionCount === 0` $\rightarrow$ **"Chưa ghi nhận"** (distinguishing no recorded retention from recorded 0 VND).
  - `retentionCount > 0 && retentionAmount === '0.0000'` $\rightarrow$ **"0 {currency}"** (explicit recorded zero).

### 3.3 Unknown Status Disclosure (FIN-02)
- If `unknownCount > 0`, a prominent secondary notice card appears directly beneath the KPI cards:
  > **Lưu ý hạng mục chưa xác định trạng thái**: Có **{unknownCount}** hạng mục với tổng giá trị **{formatMoney(unknownStatusValue)} {currencyCode}** đang ở trạng thái chưa xác định và **không được tính vào Tổng đang theo dõi**.
- In the item chart and table, unknown items are visibly designated with neutral status (`cockpit-badge--neutral`).

### 3.4 Overview Filter Scope Contract
- Search query and status filters on the overview page affect **ONLY** the items table.
- The 4 KPI cards and the horizontal bar chart represent full-project values and remain unchanged by table-level filters, ensuring directors never mistake a filtered list for the complete project financial position.

### 3.5 Valid Project with Zero Cost Items Contract
- **Case A: Project exists and is accessible, but has 0 cost items**:
  - Validated via `c1_read_project_cost_read_context` RPC.
  - Repository returns a valid overview breakdown response:
    - `summary`: All amounts `'0.0000'`, counts `0`, currency taken from `defaultCurrencyCode` in the returned context.
    - `items`: `[]`.
  - Frontend renders the clean `empty` state ("Dự án chưa có hạng mục chi phí nào") without error banners.
- **Case B: Project does not exist, belongs to another company, or is inaccessible**:
  - `c1_read_project_cost_read_context` raises `RESOURCE_NOT_FOUND` or `PERMISSION_DENIED`.
  - Repository throws `AppApiError(404, 'RESOURCE_NOT_FOUND', 'Không tìm thấy thông tin dự án.')`.
  - Frontend renders the `not_found` 404 state.

### 3.6 Decimal Precision & Safety (FIN-06)
- All monetary arithmetic (sums, comparisons, filter matches) uses `Decimal.js` with exact 4-decimal place strings.
- JavaScript `Number` is strictly forbidden for financial calculations. Floating-point numbers are only used as geometry inputs for chart coordinates inside the isolated chart wrapper.

---

## 4. Date Provenance & Ordering Architecture (DATE-01, DATE-02)

### 4.1 Company Timezone & Effective Date Derivation
Each detail row exhibits an authoritative effective date and source indicator:
1. **Confirmed Business Occurrence Date**:
   - If `relevantDate` is present (`YYYY-MM-DD`):
     - `effectiveDate = relevantDate`
     - `dateSource = 'relevant_date'`
     - UI Label: "Ngày phát sinh" (Business occurrence date)
2. **System Entry Fallback (Using Company Timezone)**:
   - If `relevantDate` is null:
     - Read company's configured `timeZone` from `c1_read_project_cost_read_context` RPC.
     - (Fallback to `Asia/Ho_Chi_Minh` only where company settings are unconfigured or lifecycle requires default).
     - Derive calendar date from `createdAt` in company timezone (`YYYY-MM-DD`).
     - `effectiveDate = formatToCompanyDate(createdAt, companyTimeZone)`
     - `dateSource = 'created_at'`
     - UI Label: Visibly badged as **"Ngày nhập hệ thống"** (System-entry date, distinct from confirmed business occurrence).

### 4.2 Deterministic Latest-Date Provenance on Overview
- For each project-cost item, `latestDetailDate` and `latestDetailDateSource` are derived from the single top detail row selected by the exact deterministic ordering:
  1. `effectiveDate` DESC
  2. `createdAt` DESC
  3. `lineNo` ASC
  4. `id` ASC
- When multiple detail rows share the same `effectiveDate`, `latestDetailDateSource` is taken from that exact deterministically sorted row. Arbitrary `max(date)` selection without source tie-break is strictly forbidden.
- If an item has 0 detail rows, `latestDetailDate = null` and `latestDetailDateSource = null`.

### 4.3 Raw Text & Unconfirmed Dates
- Unparsed source date strings or invalid dates (e.g. "31/09/2026") remain unmodified in the `note` field.
- The server and client never coerce an invalid raw string into a business date; `relevantDate` remains `null`.

### 4.4 Deterministic Sorting (Newest First)
The exact stable default sort order on the detail page:
1. `effectiveDate` DESC (newest calendar date first; nulls last)
2. `createdAt` DESC (newest database insertion first)
3. `lineNo` ASC (stable document line order)
4. `id` ASC (deterministic tie breaker)

An explicit toggle allows switching to "Cũ nhất trước" (Oldest first: `effectiveDate` ASC, `createdAt` ASC, `lineNo` ASC, `id` ASC).

---

## 5. Overview Screen UX & Chart Specification

### 5.1 Layout & Hierarchy (UI-01)
1. **Header & Navigation**:
   - Back link: "← Quay lại danh sách chi phí dự án" (`NuxtLink` to `/costs`).
   - Breadcrumb: `Danh sách chi phí dự án / [Tên dự án]`.
   - Title: `[Tên dự án]`, Project Code pill `[Mã dự án]`.
2. **KPI Summary Section**:
   - 4-card grid (1 col mobile, 2 col tablet, 4 col desktop).
   - Unknown status banner if `unknownCount > 0`.
3. **Item-Value Chart Section (UI-02)**:
   - Card title: "Giá trị theo hạng mục công việc".
   - Subtitle: "So sánh quy mô chi phí các hạng mục thuộc dự án (sắp xếp giảm dần)".
   - Horizontal bar chart with status-colored bars, zero-based axis, and custom tooltips.
4. **Items Table Section (UI-03)**:
   - Controls: Keyword search input (description/reference), Work Status filter tabs (`Tất cả`, `Đã nghiệm thu`, `Đang thực hiện`, `Chưa xác định`).
   - Item count badge: "Hiển thị M / N hạng mục".
   - Columns (Desktop):
     1. Trạng thái (Pill: Đã nghiệm thu / Đang thực hiện / Chưa xác định)
     2. Nội dung công việc (Description + reference code)
     3. Ngày gần nhất (Effective date + source badge: Phát sinh vs. Nhập HT)
     4. Giá trị công việc (Right-aligned exact formatted money + currency)
     5. Bảo hành giữ lại (Right-aligned retention amount with dynamic `% BH` badge or "—")
     6. Số chi tiết (Detail count badge)
     7. Thao tác ("Xem chi tiết" link to `/costs/:projectId/items/:id`)

### 5.2 Horizontal Bar Chart Contract (CHART-01, CHART-02)
- **Library Selection**: Pinned `nuxt-charts@2.2.3` (MIT license) and `@unovis/ts@1.7.0` (Apache-2.0 license).
- **Component Wrapper**: `app/components/costs/ProjectCostItemsChart.vue`. The wrapper encapsulates all charting library code, does not fetch data, and does not calculate financial totals.
- **Orientation & Axis**: Horizontal orientation (`orientation="horizontal"`), zero-based X-axis.
- **Sorting**: Bars strictly sorted descending by amount ($V_1 \ge V_2 \ge \dots$), tie-broken by `id`.
- **Chart Acceptance Cases**:
  - **Full item name**: Displayed in tooltip and label without arbitrary truncating. Long labels use responsive truncation with full name in tooltip.
  - **Exact money string**: Displayed money in tooltips uses original formatted string (`formatExactMoney`). Finite number conversion is restricted to coordinates.
  - **Work status**: Textual status badge/indicator in tooltip and legend. Color is never the sole indicator.
  - **Detail count**: Detail row count displayed in tooltip disclosure.
  - **Textual status legend**: Legend items include explicit text labels ("Đã nghiệm thu", "Đang thực hiện", "Chưa xác định").
  - **Empty data**: 0 items renders clean empty placeholder.
  - **All-zero values**: Items with 0 amount render zero-width bars cleanly without errors.
  - **Single-item project**: Renders 1 full-width horizontal bar cleanly.
  - **Many-item project**: Displays all project items without silent Top-N truncation.
- **Project Scope Isolation**: Strictly displays items of the currently viewed project. Never mixes cross-project items (e.g., EO GIÓ 5 items vs. Yong Mei 4 items).
- **Navigation & Accessibility**:
  - Clicking a bar navigates to `/costs/:projectId/items/:id`.
  - A parallel, accessible standard HTML link (`NuxtLink`) exists in the items table row and via keyboard focus (`tabindex="0"`, Enter/Space key triggers).

---

## 6. Dedicated Item Detail UX Specification

### 6.1 Detail Header (DETAIL-02)
- Breadcrumbs: `Danh sách chi phí / [Tên dự án] / [Tên hạng mục]`.
- Return link: "← Quay lại tổng quan chi phí dự án" (`NuxtLink` to `/costs/:projectId`).
- Header cards:
  1. **Giá trị hạng mục**: Full recognized parent amount (`detail.totalAmount`) — authoritative.
  2. **Số dòng chi tiết**: Total detail row count.
  3. **Bảo hành giữ lại**: `warrantyRetentionTotal` + detail count, or "Chưa ghi nhận" (distinguishing unrecorded retention from valid 0 VND).
  4. (If present) **Khoản giữ lại khác**: `otherRetentionTotal`.

### 6.2 Filter, Subtotal & Pagination Bar (DETAIL-04)
- **Clear Financial Separation**:
  - Full recognized parent amount remains permanently visible in the header card.
  - When keyword, date range, or retention filters are active, a distinct filtered subtotal is displayed:
    > **Giá trị theo bộ lọc: {subtotal} {currency} ({count} dòng)**
  - A filtered subtotal or single pagination slice is **NEVER** presented as the full cost-item amount.
- **Filter Controls**:
  - Keyword search: Case-insensitive search over `description` and `reference`.
  - Date range: Inclusive start (`from`) and end (`to`) date pickers matching against `effectiveDate`.
  - Retention filter: `all` | `warranty` | `other` | `none` (no recorded retention).
  - Sort order: Toggle between "Mới nhất trước" (Newest first) and "Cũ nhất trước" (Oldest first).
- **Filter Precedence & Pagination**:
  - Filtering and sorting execute **BEFORE** client-side pagination.
  - Pagination slices the resulting filtered set.
  - Modifying any filter automatically resets `currentPage` to 1.
  - Page sizes: 25, 50, 100 rows per page.
  - Controls: Previous / Next buttons, page number indicators.

### 6.3 Details Table (Desktop) & Cards (Mobile 390px) (DETAIL-03, DETAIL-05)
- **Desktop Table Columns**:
  1. STT (`#lineNo`)
  2. Ngày ghi nhận (`DD/MM/YYYY` + provenance badge: "Ngày phát sinh" vs. "Ngày nhập hệ thống")
  3. Nội dung chi tiết (Description + reference code + opening balance badge "Số liệu ban đầu")
  4. Số lượng (`quantity` or `—`)
  5. ĐVT (`unitCode` or `—`)
  6. Đơn giá (`unitPrice` or `—`)
  7. Thành tiền (Exact formatted `amount`)
  8. Giữ lại (`retentionAmount` with dynamic `% BH` badge or `—`)
  9. Ghi chú (Button "Xem ghi chú" opening notes modal, or `—`)
- **Mobile View (390px)**:
  - Responsive stacked cards replace table rows without horizontal page overflow.
  - Touch targets maintain a minimum $44 \times 44\text{px}$ size.

### 6.4 Notes & Provenance Modal (DETAIL-06)
- Long note text has a compact preview in the row/card, with a disclosure action opening the modal.
- Displays raw, unparsed notes in full without truncation. Raw note text is never parsed to infer business facts.
- Displays provenance metadata: line number, reference code, relevant date, and system entry timestamp.
- Accessible: dialog role (`role="dialog"`, `aria-modal="true"`), keyboard dismissible via `Escape` key.

---

## 7. Backend Read Context & Aggregation Architecture

### 7.1 Proposed Minimal Read-Only Forward Migration Contract
To resolve the two source blockers, the following minimal read-only forward migration is proposed:

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

### 7.2 Overview Endpoint Execution Flow
1. **Context Resolution**:
   - Call `c1_read_project_cost_read_context(companyId, projectId)` (1 RPC call).
   - If project not found $\rightarrow$ throws 404 `RESOURCE_NOT_FOUND`.
   - If module disabled $\rightarrow$ throws 403 `PERMISSION_DENIED` with `{ reason: 'MODULE_DISABLED' }`.
   - Context yields: `projectId`, `projectCode`, `projectName`, `defaultCurrencyCode`, `moneyScale`, `timeZone`.
2. **Bounded Parent Items Pagination**:
   - Query `project_cost_items` in batches of 500 rows ordered by `created_at ASC, id ASC`.
   - Repeat range queries until terminal page (`batch.length < 500`).
   - If 0 parents found: Return HTTP 200 with zero summary values (using context `defaultCurrencyCode`) and `items: []`.
3. **Item Chunking & Bounded Detail Reads**:
   - Partition parent `itemIds` into chunks of 50 items.
   - For each chunk, query details in batches of 500 rows ordered by `project_cost_item_id ASC, id ASC`.
   - Projection is minimal: `id, project_cost_item_id, line_no, amount, retention_kind, retention_rate_bps, retention_amount, relevant_date, created_at` (omitting notes, quantities, units, prices).
4. **Post-Pagination Financial Consistency Guard**:
   - Verify $\sum \text{detail.amount} == \text{parent.amount}$ for all parent items.
   - Bounded retry (max 2 attempts, 50ms backoff) on detected concurrent modification.
   - Fail safely with `INTERNAL_ERROR` (`reason: 'DATA_CONSISTENCY_ERROR'`).
5. **Deterministic Latest-Date Provenance**:
   - Derive `latestDetailDate` and `latestDetailDateSource` from the top row of the deterministic sort: `effectiveDate DESC, createdAt DESC, lineNo ASC, id ASC`.

### 7.3 Dedicated Detail Endpoint Execution Flow
1. **Ownership Check**:
   - Read parent item under `tenant_id` and `company_id`.
   - Validate `parentItem.project_id === expectedProjectId`. If mismatch, throw 404 `RESOURCE_NOT_FOUND`.
2. **Context Resolution**:
   - Call `c1_read_project_cost_read_context(companyId, projectId)` to get project metadata and `timeZone`.
3. **Bounded Detail Reads**:
   - Paginate detail rows in batches of 500 rows.
   - Validate amount invariant.
   - Enrich rows with `effectiveDate` (formatted in company `timeZone`) and `dateSource`.

### 7.4 Honest Query Accounting
For Project Overview:
- Exactly 1 frontend HTTP request.
- Backend queries: `1 read-context RPC + N parent pages + sum(detail pages per item-ID chunk)`.
- No separate direct settings read; no separate legacy metadata RPC.

---

## 8. State Management, Error Contract & Security Boundaries

### 8.1 7-State UI State Machine
1. `loading`: Skeleton placeholders.
2. `ready`: Data loaded and displayed.
3. `empty`: Project has 0 items (overview), or parent item has 0 details (detail page).
4. `module`: Handled when `error.code === 'PERMISSION_DENIED'` and `error.details?.reason === 'MODULE_DISABLED'`.
5. `permission`: `error.code === 'PERMISSION_DENIED'`.
6. `not_found`: `error.code === 'RESOURCE_NOT_FOUND'`.
7. `error`: 500 `INTERNAL_ERROR` / network error with "Thử lại" retry button.

### 8.2 Security Boundaries Preserved
- **Auth & RBAC**: Unchanged. Requires `cost.read` permission.
- **RLS**: Queries execute strictly via actor-scoped `UserSupabaseClient`. Zero service-role bypass.
- **Table RLS Unwidened**: `company_cost_settings` table RLS remains restricted to `cost.config.manage`. Reading settings for `cost.read` occurs strictly within the authorized read-context RPC.
- **Company & Tenant Isolation**: Every query filters on `tenant_id` and `company_id`.
- **Database Safety**: Single forward-only read-only migration; zero schema mutations on existing tables; zero write command alterations.

### 8.3 Company Switcher Invalidation
- When active company changes, in-flight requests are immediately invalidated via monotonic request sequencing (`current !== request`).
- Cached detail state is cleared, preventing stale responses across company switches.

### 8.4 Accessibility (WCAG 2.1 AA)
- Statuses use both color and text pills.
- All interactive controls have visible focus rings.
- 44px touch targets on mobile.
- Zero horizontal page overflow at 390px viewport.
- Full raw notes modal is keyboard-dismissible via Escape.
