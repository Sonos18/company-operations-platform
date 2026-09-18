# C1-P3R Gate G Director Project Cost UI Report

```yaml
status: PASS_GATE_G_UI_FINAL_REVIEW_FIXES_COMPLETE
phase: C1-P3R-GATE-G-DIRECTOR-PROJECT-COST-UI-FINAL-REVIEW-FIX

baseline:
  branch: feat/taskovia-gate-g-director-project-cost-ui
  merge_base_main: 6e2d3d11f144e851a8947832165fd86201146b57

routes:
  /costs:
    purpose: project_cost_overview
    permission: cost.read
    data_source: repositories.projectCosts.summaries()
  /costs/:projectId:
    purpose: project_cost_detail
    permission: cost.read
    data_source: repositories.projectCosts.project(projectId)
  /costs/sources:
    purpose: cost_source_overview
    permission: cost.source.read
    data_source: repositories.costSourceRead.overview()
  /costs/projects/:projectId:
    purpose: cost_source_detail
    permission: cost.source.read
    back_target: /costs/sources

permissions:
  project_cost: cost.read
  cost_source: cost.source.read
  project_register_manage_required: false
  role_checks_added: false

project_metadata:
  source: projectCosts
  projectCode_rendered: true
  projectName_rendered: true
  separate_project_register_request: false
  hardcoded_vqh_metadata: false

currency_review:
  original_finding: hardcoded_VND
  severity: IMPORTANT
  resolved: true

currency_contract:
  source: ProjectCostSummary.currencyCode
  overview_hardcoded_currency: false
  detail_hardcoded_currency: false
  multi_project_multi_currency_tested: true
  usd_fixture_tested: true

mobile_navigation_review:
  original_finding: unbalanced_4_plus_2_mobile_navigation
  severity: IMPORTANT
  resolved: true

mobile_navigation:
  layout_390: 3x2
  minimum_tap_target_px: 44
  content_clearance_verified: true
  horizontal_overflow: false
  safe_area_accounted_for: true

visual:
  mobile_overview: PASS
  mobile_detail: PASS
  mobile_cost_source: PASS

project_cost_ui:
  accepted_visible: true
  in_progress_visible: true
  unknown_visible: true
  unknown_excluded_from_total: true
  write_controls_added: false
  source_mechanics_exposed: false

source_ui:
  preserved: true

state_safety:
  company_switch: protected
  stale_response_protection: verified
  loading: handled
  empty: handled
  permission: handled
  module_disabled: handled
  error_retry: handled
  not_found: handled

visual_foundation:
  cockpit_foundation: preserved
  desktop_1440: verified
  mobile_390: verified
  accessibility_axe: PASS

testing:
  red_evidence: PASS
  focused_e2e: PASS
  navigation_unit_tests: PASS
  typecheck: PASS
  lint: PASS
  build: PASS
  verify_app: PASS
  diff_check: PASS

visual_evidence:
  overview_desktop: test-results/gate-g-overview-1440.png
  overview_mobile: test-results/gate-g-overview-390.png
  detail_desktop: test-results/gate-g-detail-1440.png
  detail_mobile: test-results/gate-g-detail-390.png
  source_sanity: test-results/gate-g-sources-sanity.png
  usd_fixture_visible_in:
    - test-results/gate-g-overview-1440.png (Project Beta card)
    - test-results/gate-g-overview-390.png (Project Beta card)
    - test-results/gate-g-detail-1440.png (Synthetic Project Beta breakdown)
    - test-results/gate-g-detail-390.png (Synthetic Project Beta breakdown)

safety:
  cloud_db_commands: 0
  backend_changes: 0
  new_shared_changes: 0
  migration_changes: 0
  rbac_changes: 0
  auth_changes: 0

gates:
  gate_f: COMPLETE
  gate_g_database_enabler: CLOUD_VERIFIED
  gate_g_metadata_contract: COMPLETE
  gate_g_currency_contract: COMPLETE
  gate_g_ui: FINAL_REVIEW_FIXES_COMPLETE_PENDING_MERGE_REVIEW
  gate_h: NOT_STARTED_NOT_AUTHORIZED
```

## Summary

The Director Project Cost UI currency alignment review fix is complete on the feature branch `feat/taskovia-gate-g-director-project-cost-ui`.

1. **Review Finding Resolution:**
   - ChatGPT review identified an Important finding: `/costs` overview and `/costs/:projectId` detail hardcoded `VND` in summary displays, which broke multi-currency correctness for non-VND projects.
   - The M2.1 contract added `summary.currencyCode` to the canonical `ProjectCostSummary` schema.
   - The UI was updated to consume `entry.summary.currencyCode` (overview) and `detail.summary.currencyCode` (detail), eliminating all hardcoded `VND` strings from the Project Cost UI.

2. **Multi-Currency Verification:**
   - Both VND and USD synthetic project fixtures are exercised in the automated test suite.
   - Overview tests verify that `Synthetic Project Alpha` renders `VND` and `Synthetic Project Beta` renders `USD` on the same page.
   - Detail tests verify that `Synthetic Project Beta` renders `USD` in its summary card and on its items.
   - Initial RED test runs proved the original bug failed before code edits, and GREEN runs confirmed the fix.

3. **Boundaries & Verification:**
   - No write operations, creation forms, or edit controls added.
   - Zero database mutations, zero cloud DB commands (`pnpm db:dev:*`), zero migrations, zero RBAC/Auth changes.
   - Playwright E2E suite (`project-costs.spec.ts` + `app-shell-navigation.spec.ts`, 28 tests) passed green.
   - Accessibility tests via AxeBuilder confirm zero WCAG violations on both desktop and mobile viewports.
   - `pnpm verify:app` (unit tests, typecheck, lint, build) exited 0.

4. **Mobile Navigation Review Fix:**
   - Visual review identified an Important finding: with 6 permission-filtered links at 390px, a 4-column layout created an unbalanced 4+2 grid with sub-44px tap targets and insufficient bottom clearance.
   - Fixed `.mobile-nav` to a balanced 3 columns × 2 rows grid (`repeat(3, minmax(0, 1fr))`) with `min-height: 44px` on each link and safe-area inset support.
   - Updated `.app-main` mobile bottom padding to `calc(130px + env(safe-area-inset-bottom, 0px))` ensuring page content clearance on long pages.
   - Verified that 3, 4, 5, and 6 links do not produce horizontal overflow or unusable tap targets.
