# C1-P3R Project Cost Detail Read Model + UI Report

```yaml
status: PASS_PROJECT_COST_DETAIL_READ_UI_READY_FOR_REVIEW
phase: C1-P3R-PROJECT-COST-DETAIL-READ-UI

api:
  get_detail: implemented
  write_endpoints: 0

data:
  source: project_cost_item_details
  parent_total_derived: true
  double_count: false

safety:
  migrations: 0
  cloud_commands: 0
  rbac_changes: 0

gates:
  gate_g: COMPLETE
  gate_h: NOT_STARTED_NOT_AUTHORIZED
```

## Summary

This task implements the bounded read-only Project Cost Detail v1 model and UI:

1. **Shared Read Contract**:
   - Added `projectCostDetailKindSchema` (`'opening_balance' | 'line_item'`).
   - Added `projectCostItemDetailSchema` (strict camelCase schema with offset-aware ISO timestamps for Postgres compatibility).
   - Added `projectCostDetailsResponseSchema` (`projectCostItemId`, `totalAmount`, `currencyCode`, `details: detail[]`).

2. **Server Read Implementation**:
   - Single GET endpoint: `GET /api/companies/:companyId/project-costs/:projectCostItemId/details`.
   - Requires `cost.read` permission within standard `c1RequestContext`.
   - Reads parent `project_cost_items` scoped to `tenant_id`, `company_id`, and `projectCostItemId` (returns 404 if not found).
   - Reads `public.project_cost_item_details` scoped to tenant, company, and project cost item, ordered by `line_no ASC, id ASC`.
   - Decimal-safe arithmetic checks `SUM(details.amount) == parent.amount_text`. Throws `500 INTERNAL_ERROR` if mismatched; returns empty details array if zero details exist.
   - Zero database writes, zero migrations, zero RBAC changes.

3. **Frontend Repository**:
   - Extended `ProjectCostRepository` and `createHttpProjectCostRepository` with `details(projectCostItemId)`.
   - Calls `GET /api/companies/:companyId/project-costs/:projectCostItemId/details` and validates response with `projectCostDetailsResponseSchema`.

4. **Project Cost Detail UI (`app/pages/costs/[projectId].vue`)**:
   - Preserves parent rows as canonical representations without double-counting amounts in project totals.
   - Expandable detail area per row with "Xem chi tiết" / "Thu gọn" button (44px minimum tap target, `aria-expanded`, `aria-controls`).
   - Lazy loads detail data only upon parent row expansion; caches results in session memory to avoid duplicate fetches.
   - Independent status handling per expanded item (loading, ready, empty, error) with localized "Thử lại" retry action.
   - Desktop view: structured nested table (Nội dung, Số lượng, ĐVT, Đơn giá, Thành tiền, Ngày, Tham chiếu / Ghi chú), with "Số liệu ban đầu" badge for `opening_balance` and `—` for null fields.
   - Mobile view: compact stacked cards without horizontal overflow, accessible color contrast meeting WCAG 2 AA.

5. **Verification**:
   - Shared contract unit tests: 32 tests passing in `tests/unit/costs/project-costs.spec.ts`.
   - Server service & repository unit tests: 41 tests passing in `tests/unit/server/project-cost.service.spec.ts`.
   - HTTP repository unit tests: 24 tests passing in `tests/unit/repositories/http-project-cost-repository.spec.ts`.
   - Playwright E2E tests: 14 tests passing in `tests/e2e/project-costs.spec.ts` (including lazy-load, session caching, independent row state, retry on failure, and mobile rendering with zero axe violations).
   - Full test suite: 128 test files / 1032 unit tests passing (`pnpm test:unit`).
   - Full application verification (`pnpm verify:app`): unit tests, typecheck, lint, and build all passed.
   - `git diff --check`: clean (0 whitespace/formatting errors).
