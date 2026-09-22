# C1 Frontend Final Review Findings Progress

Status: C1_FRONTEND_PUSHED_FOR_FINAL_REVIEW

## Work Disposition & Account Handoff

### 1. Work Recovered from Old Account
- Extracted ledger child components: `app/components/costs/ProjectCostOrdinaryLedger.vue`, `app/components/costs/ProjectCostSubcontractLedger.vue`, and `app/components/costs/ProjectCostSubcontractorTable.vue`.
- Core skeleton for `useLedgerQueryController.ts` in `app/composables/costs/`.
- Accessible info popover skeleton: `app/components/costs/ProjectCostInfoDisclosure.vue`.
- Initial typed KPI view model in `app/utils/costs/finance-display.ts` and consumption in `app/pages/costs/index.vue` and `app/pages/costs/[projectId]/index.vue`.
- Initial centralized error mapper in `app/utils/costs/costs-error-mapper.ts`.

### 2. Work Completed in this Session
- **RR01 (Authoritative Query State)**: Finished `useLedgerQueryController.ts` with full query replacement semantics, eliminating duplicate query state between coordinator and ledgers. Cleared filters remove parameters from outgoing requests. Local date validation (`dateFrom > dateTo`) halts dispatch and emits `validation_error`. Synchronized page clamping without circular request loops. Maintained strict separation between full totals, filtered totals, and visible page rows.
- **RR02 (Immediate Request Invalidation at User Intent)**: Invalidation occurs instantly on draft search input (before the 300ms debounce dispatches), on date filter change, retention change, page change, pageSize change, contractor/contract selection changes, context transitions, and unmount. Stale in-flight responses cannot write rows, update money totals, set errors, or dismiss loading spinners.
- **RR03 (Restored Ordinary Row Information)**: Restored all financial and descriptive fields in `ProjectCostOrdinaryLedger.vue` for both desktop (table) and mobile 390px (card layout): `description`, opening-balance marker, `quantity`, `unitCode`, `unitPrice`, `amount`, `effectiveDate`, date provenance badge, `retentionKind`, `retentionRateBps`, `retentionAmount`, `reference`, and `note`. Reference and note render simultaneously without `v-if`/`v-else-if` exclusion; notes render as plain escaped text.
- **RR04 (Propagate Specific Ledger Error States)**: Carried typed error classifications (`MODULE_DISABLED`, `PERMISSION_DENIED` / `COMPANY_FORBIDDEN`, `RESOURCE_NOT_FOUND`, `INPUT_INVALID` / validation, server error, and aborted) directly into ledger components. Permission denied clears previous private rows; module disabled shows feature unavailable copy; resource not found shows context-specific empty state; retry reuses the exact current query.
- **RR05 (Production-Path Regression Coverage)**: Authored 11 comprehensive production boundary Playwright test cases in `tests/e2e/costs-production-boundary.spec.ts` using 65 synthetic rows, real controllers, and real HTTP query parameter assertions. Authored 6 controller unit tests in `tests/unit/costs/ledger-query-controller.spec.ts`.
- **C1 Dashboard Layout & Presentation Refinement**:
  - Replaced monolithic wrapper with coherent `.cost-analysis-section` containing a dedicated header, 2-card desktop grid (`.charts-grid`), and a standalone Cockpit card for the category table (`.category-summary-card`).
  - Enforced equal desktop widths, equal card heights, aligned top and bottom edges, consistent inner padding (`20px`), and stable chart body height (320px desktop, 300px tablet, 280px mobile).
  - Standardized `.category-list-table` column proportions via `<colgroup>` (`col-cat`: ~34%, `col-amount`: ~30%, `col-status`: ~20%, `col-action`: ~16%) matching `table-layout: fixed`.
  - Added clean responsive mobile presentation (<640px) transforming each table row into a 2-row grid card (Category + Status on top, tabular Amount + Action on bottom), eliminating horizontal clipping (`scrollWidth <= window.innerWidth` at 390px).
- **Warranty/Bảo hành UI Rule**:
  - Warranty remains visible across all relevant layouts; neither the Warranty column nor the project Warranty KPI is conditionally removed.
  - Confirmed zero warranty (`0` / `'0'`) displays explicitly as `0 VND` (or with currency code).
  - Genuinely missing/unrecorded warranty (`null`) displays as `—` (or `Chưa ghi nhận` / `Chưa đối soát` in KPI cards).
  - Profit calculation remains strictly server-authoritative (`summary.management.result`); no provisional profit arithmetic was introduced in Vue.
- **Bounded Quality Cleanup**:
  - Migrated `formatOwnerReceiptsDisplay`, `formatFinanceMoney`, and KPI helpers to named typed object inputs in `finance-display.ts`; safely handled numeric and string money inputs.
  - Extracted accessible `ProjectCostInfoDisclosure.vue` with keyboard focus, Escape, click dismissibility, and outside click handling.
  - Unified single typed KPI presentation model (`entry.kpis`) on both `/costs` and `/costs/:projectId`.
  - Strengthened ECharts datum event targeting (`p.componentType === 'series'`) with background click immunity.

---

## Finding Status (RR01 - RR05)

| Finding | Status | Production Implementation | Verification Evidence |
|---|---|---|---|
| **RR01: Authoritative Query State** | Implemented & Verified | `app/composables/costs/useLedgerQueryController.ts`, `ProjectCostOrdinaryLedger.vue`, `ProjectCostSubcontractLedger.vue`, `[categoryId].vue` | Unit: 6/6 PASS (`ledger-query-controller.spec.ts`). Playwright: Tests 1, 2, 3, 8 in `costs-production-boundary.spec.ts` PASS. Clearing search and date bounds removes query parameters completely from HTTP requests. |
| **RR02: Request Invalidation on Intent** | Implemented & Verified | `useLedgerQueryController.ts`, `[categoryId].vue`, `costs/index.vue`, `[projectId]/index.vue` | Playwright: Tests 4, 9, 10 in `costs-production-boundary.spec.ts` PASS. Immediate invalidation on typing rejects stale responses arriving during debounce; two-started-requests race preserves newer request; selection change discards in-flight requests. |
| **RR03: Restored Ordinary Row Information** | Implemented & Verified | `ProjectCostOrdinaryLedger.vue` (desktop table & mobile cards) | Playwright: Test 6 in `costs-production-boundary.spec.ts` PASS. Quantity, unitCode, unitPrice, reference, and note render simultaneously on desktop and 390px. |
| **RR04: Specific Ledger Error States** | Implemented & Verified | `app/utils/costs/costs-error-mapper.ts`, `ProjectCostOrdinaryLedger.vue`, `ProjectCostSubcontractLedger.vue` | Playwright: Test 7 in `costs-production-boundary.spec.ts` PASS. `MODULE_DISABLED`, permission denied, not found, validation error, and server error with retry render distinct accessible states. |
| **RR05: Production Path Connection Tests** | Implemented & Verified | `tests/e2e/costs-production-boundary.spec.ts`, `tests/unit/costs/ledger-query-controller.spec.ts` | Unit: 6/6 PASS. Playwright: 11/11 PASS with 65 synthetic rows testing real HTTP queries, pagination 1->2->3->Prev, pageSize 25/50/100, zero-result recovery, debounce race, and retention breakdown. |

---

## Final Verification Summary (Executed on Final Tree)

1. **Focused Costs Unit Tests (`pnpm test:unit tests/unit/costs`)**:
   - 9 test files, 133/133 passed (2.87s, Exit code 0).
2. **Full Repository Unit Tests (`pnpm test:unit`)**:
   - 143 test files, 1177/1177 passed (Exit code 0).
3. **Typecheck (`pnpm typecheck`)**:
   - 0 errors (Exit code 0).
4. **Lint (`pnpm lint`)**:
   - 0 errors (Exit code 0).
5. **Production Build (`pnpm build`)**:
   - Client and Nitro server bundles built successfully (Exit code 0).
6. **Full App Verification (`pnpm verify:app`)**:
   - Clean PASS (Exit code 0).
7. **Costs Production Boundary E2E (`tests/e2e/costs-production-boundary.spec.ts`)**:
   - 11/11 tests passed (Exit code 0).
8. **Costs Playwright E2E Suite (`tests/e2e/project-costs.spec.ts` & `tests/e2e/costs-production-boundary.spec.ts`)**:
   - 33/33 tests passed (2.3m, Exit code 0).
9. **Git Diff Check (`git diff --check`)**:
   - Clean whitespace, no warnings (Exit code 0).
10. **Live HTTP Status**:
   - `LIVE_HTTP=NOT_RUN_REQUIRES_LOGIN` (synthetic/mocked sessions and real test controllers fully validated).

---

## Screenshot & Visual Verification

Screenshots captured and verified in `test-results/`:
- Directory Desktop (1440px): `test-results/gate-g-overview-1440.png`
- Directory Mobile (390px): `test-results/gate-g-overview-390.png`
- Project Overview Desktop (1440px): `test-results/gate-g-detail-1440.png`
- Project Overview Mobile (390px): `test-results/gate-g-detail-390.png`
- Ordinary Ledger Page 2 Desktop (1440px): `test-results/gate-g-ordinary-page2-1440.png`
- Ordinary Ledger Page 2 Mobile (390px): `test-results/gate-g-ordinary-page2-390.png`
- Ordinary Detail with Restored Fields Desktop & Mobile: verified in `gate-g-category-1440.png` & `gate-g-category-390.png`
- Contractor List Desktop & Mobile: `test-results/gate-g-subcontract-category-1440.png` & `gate-g-subcontract-category-390.png`
- Payment Ledger Desktop & Mobile: `test-results/gate-g-payment-ledger-1440.png` & `gate-g-payment-ledger-390.png`
- Tooltip & Info Disclosure: `test-results/gate-g-tooltip-active.png`
- Cost Source UI: `test-results/cost-source-ui-synthetic.png`

Responsive checks confirm `scrollWidth <= clientWidth` on both 1440px and 390px (no horizontal overflow).

---

## Next Action
Final verification completed and passed across all local and browser checks.
Ready for commit and push to `feat/c1-costs-finance-fields`.
