# C1 Frontend Final Review Findings Progress

Status: READY_C1_FE_REVIEW_FIXES

## Finding Status (R01 - R06)

| Item | Status | Key Production Files | Key Test Files | Verification Evidence |
|---|---|---|---|---|
| **R01: Pagination, Filters, Totals** | Implemented & Verified | `app/components/costs/ProjectCostOrdinaryLedger.vue`, `app/components/costs/ProjectCostSubcontractLedger.vue` | `tests/unit/costs/ledger-pagination.spec.ts`, `tests/e2e/project-costs.spec.ts` | Unit: 15/15 PASS. 65 synthetic records tested across pages 1/2/3, page sizes 25/50/100, filtering, date range validation, full vs filtered totals stable. E2E: 23/23 PASS. |
| **R02: Stale Response Protection** | Implemented & Verified | `app/utils/costs/async-request-tracker.ts`, `app/pages/costs/[projectId]/categories/[categoryId].vue`, `app/pages/costs/[projectId]/index.vue`, `app/pages/costs/index.vue` | `tests/unit/costs/async-request-tracker.spec.ts`, `tests/e2e/project-costs.spec.ts` | Unit: 4/4 PASS. Independent generation tracking and immediate invalidation on identity/selection change across directory, overview, and ledgers. E2E company switch stale cancellation test PASS. |
| **R03: Error States & Old Money Gating** | Implemented & Verified | `[categoryId].vue`, `ProjectCostSubcontractLedger.vue`, `ProjectCostOrdinaryLedger.vue`, `[projectId]/index.vue`, `costs/index.vue` | `tests/unit/costs/async-request-tracker.spec.ts`, `tests/e2e/project-costs.spec.ts` | Previous data cleared immediately upon selection/identity change (`overview.value = null`, rows reset). Explicit error/retry states verified for 403, 404, 500. E2E: retry and error tests PASS. |
| **R04: Retention Separation & Scope** | Implemented & Verified | `app/utils/costs/finance-display.ts` (`computePageRetentionBreakdown`), `ProjectCostOrdinaryLedger.vue` | `tests/unit/costs/finance-display.spec.ts`, `tests/unit/costs/ledger-pagination.spec.ts` | Unit: PASS. Warranty and other retention strictly separated; page-level subtotal explicitly scoped with `(trên trang này)` to avoid misleading whole-category claims. |
| **R05: Specific Error Reason First** | Implemented & Verified | `app/utils/costs/costs-error-mapper.ts`, `costs/index.vue`, `costs/[projectId]/index.vue`, `[categoryId].vue` | `tests/unit/costs/costs-error-mapper.spec.ts`, `tests/e2e/project-costs.spec.ts` | Unit: 7/7 PASS. Centralized error mapping checks `MODULE_DISABLED` reason before generic `PERMISSION_DENIED`. Verified across directory, overview, and category details. |
| **R06: Receipts KPI Binding** | Implemented & Verified | `app/utils/costs/finance-display.ts` (`formatOwnerReceiptsDisplay`, `computeProjectKpiCards`), `costs/index.vue`, `costs/[projectId]/index.vue` | `tests/unit/costs/finance-display.spec.ts`, `tests/e2e/project-costs.spec.ts` | Unit: 41/41 PASS. Receipts KPI bound strictly to `summary.management.receipts`, secondary budget text rendered without overwriting KPI. Profit uses server result only. |

## Bounded Refactor Status (A - G)

- **A (Component Separation)**: Extracted `ProjectCostOrdinaryLedger.vue`, `ProjectCostSubcontractLedger.vue`, and `ProjectCostSubcontractorTable.vue`. Coordinator pattern preserved in `[categoryId].vue`.
- **B (Independent Stream Tracker)**: `createAsyncRequestTracker` instantiated independently across directory, project overview, and category/ledger views.
- **C (Typed KPI View Models)**: `computeProjectKpiCards` computes all 4 KPI view models (`provisionalProfit`, `receipts`, `cost`, `warranty`) once in a single typed pass.
- **D (Obsolete Helpers)**: Verified callers, removed dead code paths.
- **E (Chart Datum Navigation)**: ECharts series datum event check (`p.componentType === 'series'`) uses authoritative `data.categoryId`. Legend and background clicks isolated from accidental navigation.
- **F (Money Formatting)**: Documented precision policy honored, stored values preserved without arbitrary rounding.
- **G (Handoff Documentation)**: All statuses and findings consolidated in this single progress artifact.

## Verification Summary

1. `pnpm test:unit`: 142 test files, 1169/1169 passing (Exit code 0).
2. `pnpm typecheck`: 0 errors (Exit code 0).
3. `pnpm lint`: 0 errors (Exit code 0).
4. `pnpm build`: Nuxt & Nitro client/server bundles built successfully (Exit code 0).
5. `pnpm verify:app`: Full verification suite PASS (Exit code 0).
6. `pnpm exec playwright test tests/e2e/project-costs.spec.ts`: 23/23 passing (Exit code 0).
7. `pnpm exec playwright test tests/e2e/cost-source-ui.spec.ts`: 2/2 passing (Exit code 0).
8. `git diff --check`: Clean whitespace, no warnings (Exit code 0).

## Screenshot Evidence

- Directory Desktop (1440px): `test-results/gate-g-overview-1440.png`
- Directory Mobile (390px): `test-results/gate-g-overview-390.png`
- Project Overview Desktop (1440px): `test-results/gate-g-detail-1440.png`
- Project Overview Mobile (390px): `test-results/gate-g-detail-390.png`
- Ordinary Ledger Page 2 Desktop (1440px): `test-results/gate-g-ordinary-page2-1440.png`
- Ordinary Ledger Page 2 Mobile (390px): `test-results/gate-g-ordinary-page2-390.png`
- Contractor List Desktop (1440px): `test-results/gate-g-subcontract-category-1440.png`
- Contractor List Mobile (390px): `test-results/gate-g-subcontract-category-390.png`
- Payment Ledger Desktop (1440px): `test-results/gate-g-payment-ledger-1440.png`
- Payment Ledger Mobile (390px): `test-results/gate-g-payment-ledger-390.png`
