# C1-P3R Project Cost Detail Read Model + UI Report (with Warranty Retention Amendment)

```yaml
status: PASS_PROJECT_COST_DETAIL_RETENTION_READY_FOR_REVIEW
phase: C1-P3R-PROJECT-COST-DETAIL-READ-UI

api:
  get_detail: implemented
  write_endpoints: 0

data:
  source: project_cost_item_details
  parent_total_derived: true
  double_count: false
  retention_metadata: implemented
  retention_alters_totals: false

safety:
  migrations: 0
  cloud_commands: 0
  rbac_changes: 0

gates:
  gate_g: COMPLETE
  gate_h: NOT_STARTED_NOT_AUTHORIZED
```

## Summary

This task implements and amends the bounded read-only Project Cost Detail v1 model and UI with structured subcontract warranty retention:

1. **Shared Read Contract**:
   - Added `projectCostDetailKindSchema` (`'opening_balance' | 'line_item'`).
   - Extended `projectCostItemDetailSchema` with structured warranty retention fields:
     - `retentionKind: z.enum(['warranty', 'other']).nullable()`
     - `retentionRateBps: z.number().int().min(0).max(10000).nullable()`
     - `retentionAmount: decimalStringSchema.nullable()`
   - Enforced schema consistency via `superRefine`: all three fields are null when no retention; `retentionKind` and `retentionAmount` must be non-null when retention is present; `retentionRateBps` can be null or integer bps; and `retentionAmount` cannot exceed detail `amount` using decimal-safe comparison.
   - Preserved `projectCostDetailsResponseSchema` (`projectCostItemId`, `totalAmount`, `currencyCode`, `details: detail[]`).

2. **Server Read Implementation**:
   - Single GET endpoint: `GET /api/companies/:companyId/project-costs/:projectCostItemId/details`.
   - Requires `cost.read` permission within standard `c1RequestContext`.
   - Selected and mapped `retention_kind -> retentionKind`, `retention_rate_bps -> retentionRateBps`, `retention_amount_text -> retentionAmount`.
   - Financial invariant strictly preserved: `SUM(detail.amount) == parent.amount_text`. Retention is explanatory metadata and does NOT alter or participate in parent totals.
   - Zero database writes, zero migrations, zero RBAC changes.

3. **Frontend Repository**:
   - `createHttpProjectCostRepository` supports structured warranty retention and strictly validates responses against `projectCostDetailsResponseSchema`.

4. **Project Cost Detail UI (`app/pages/costs/[projectId].vue`)**:
   - Recognized amount remains visually primary.
   - For details with warranty retention: renders localized retention subline directly underneath recognized amount (`Giữ lại bảo hành [X%]`, e.g., `Giữ lại bảo hành 5%` with `1,560,000 VND`). Never exposes "500 bps".
   - Details without retention do not render an empty retention block.
   - Compact retention summary bar rendered at top of expanded detail area when one or more details have retention (e.g. `Giữ lại bảo hành: 5,376,500 VND`).
   - Mobile view: renders retention in compact stacked cards without horizontal page overflow at 390px; maintains minimum 44px interactive tap targets.
   - Yong Mei subcontract cost fixture: total recognized cost `107,530,000 VND`, retention total `5,376,500 VND`. Amount after retention (`102,153,500`) is NOT authoritative and is NOT labeled as paid, advance, payment, or equivalent.

5. **Verification**:
   - Shared contract unit tests: 35 tests passing in `tests/unit/costs/project-costs.spec.ts`.
   - Server service & repository unit tests: 43 tests passing in `tests/unit/server/project-cost.service.spec.ts`.
   - HTTP repository unit tests: 25 tests passing in `tests/unit/repositories/http-project-cost-repository.spec.ts`.
   - Playwright E2E tests: 17 tests passing in `tests/e2e/project-costs.spec.ts` (including desktop retention rendering, mobile 390px view without horizontal overflow, zero axe violations, and no-retention isolation).
   - Full test suite: 128 test files / 1,038 unit tests passing (`pnpm test:unit`).
   - Full application verification (`pnpm verify:app`): unit tests, typecheck, lint, and build all passed.
   - `git diff --check`: clean (0 whitespace/formatting errors).
