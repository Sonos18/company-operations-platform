# Taskovia C1 Cost Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver C1 as a company-scoped, source-first cost-management module with immutable financial history, private evidence files, and truthful partial financial reporting.

**Architecture:** Extend the existing Nuxt/Nitro modular monolith with C1 feature types, strict shared schemas, HTTP repositories, thin company-scoped routes, services, and Supabase-backed repositories/RPC commands. Financial facts remain engagement-scoped and immutable after publication; source intake and source figures are company-scoped and non-posting. C1 never falls back to mock repositories, never derives authority from the UI, and never makes C2/C3 behavior executable.

**Tech Stack:** Nuxt 4.3, Vue 3.5, Nitro/H3, TypeScript 5.9, Zod 4, Supabase/PostgreSQL, RLS, Supabase Storage, Vitest, Playwright, SheetJS CE `0.20.3`, `decimal.js` `10.6.0`.

**Spec:**
- `docs/superpowers/specs/taskovia-cost-management-v1.1/README.md`
- `docs/superpowers/specs/taskovia-cost-management-v1.1/01-taskovia-c1-c3-design-v1.1.md`
- `docs/superpowers/specs/taskovia-cost-management-v1.1/02-taskovia-c1-detailed-spec-v1.1.md`
- `docs/superpowers/specs/taskovia-cost-management-v1.1/00-taskovia-v1.1-changelog.md`

**Approved execution base:** `b2731f4ef72c10cbcafe9f176cc1e2b54b9c8cfd` (`origin/main` after the preserved Stage 01 merge and EOL portability repair).

## Global Constraints

- Implement C1 only. Do not implement attendance, roster/rates, settlements, payroll, intercompany accounting, generic Excel ETL, real-data migration, or C2/C3 behavior.
- Supabase Cloud DEV is the only development database. Every future Cloud command needs that phase's explicit authorization and must use a guarded `db:dev:*` command. Never use Local DB fallback, reset, repair, seed real data, or alter Production.
- Migration files are forward-only. Generate every migration with `pnpm exec supabase migration new <suffix>`; never hand-name a timestamp, edit an applied migration, or use migration repair.
- Keep `company_cost_settings.enabled=false` for all real companies until compatible application code is deployed and a separately authorized onboarding action grants C1 permissions to synthetic actors only.
- Resolve tenant/company/actor on the server from the authenticated membership. Payloads must not choose the tenant, actor, or an unscoped company.
- Enable and force RLS for every C1 table and storage metadata path. Policies use indexed scope columns and `(select auth.uid())`; any narrowly justified `SECURITY DEFINER` helper lives in `private`, has a fixed search path and explicit caller check, and is revoked from `PUBLIC`, `anon`, and `authenticated`.
- Index every C1 foreign key and RLS predicate. List/history APIs use validated keyset cursors `(created_at,id)` or `(reporting_date,id)`, never deep `OFFSET`; composite indexes put tenant/company equality columns before status/date ranges.
- Keep upload, preview parsing, signing, and all external/file work outside database transactions. Financial commands acquire the documented company/source/engagement/document/selection locks in stable UUID order and keep the commit transaction short.
- Use decimal strings at every JSON boundary; `numeric(20,4)` for money, `numeric(18,4)` quantities, and `numeric(20,6)` unit rates. Never use JavaScript `number` for monetary amounts.
- Use real authenticated HTTP repositories at runtime. Mock repositories remain test doubles for legacy prototype surfaces and are never a C1 fallback.
- Preserve historical source bytes, published facts, source figures, events, and receipts. Corrections/revisions/ended links append history; they do not overwrite it.
- Tests and fixtures use only synthetic `c100...`/`c101...` UUIDs, `@taskovia.invalid` accounts, and generated file bytes. Never commit or log real VQH workbooks, payroll, contracts, people, or amounts.
- Every phase stops at its review gate. A later prompt authorizes exactly one phase and must re-read this plan, the acceptance map, the progress file, and verify the last reviewed remote SHA.

## Dependency Decision

| Dependency | Exact installation | License | Why it is required | Security boundary |
| --- | --- | --- | --- | --- |
| SheetJS CE | `pnpm add https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` | Apache-2.0 | Server-side static XLSX cell/sheet preview, including cached formula values and legacy XLS decode support. Official documentation identifies the CDN tarball, not npm `0.18.5`, as the current distribution. | Parse only server-side, cap compressed/uncompressed size/sheets/cells/page rows/columns, never evaluate formulas/macros/OLE/hyperlinks, escape returned cell text, reject MIME/extension mismatch, retain unsupported/encrypted input as original bytes without preview. Pin URL and lockfile; review SheetJS advisory/tooling output rather than suppressing blindly. |
| decimal.js | `pnpm add decimal.js@10.6.0` | MIT | Exact financial arithmetic for aggregates, allocation limits, comparisons, and source-derived display amounts. | Construct only from schema-validated decimal strings; reject exponent/NaN/Infinity/scale overflow before construction; serialize with canonical fixed-scale strings; never expose a `Decimal` object in JSON. |

Official sources to re-check immediately before P2 dependency installation: [SheetJS framework installation](https://docs.sheetjs.com/docs/getting-started/installation/frameworks/), [SheetJS security](https://docs.sheetjs.com/docs/miscellany/security/), [SheetJS license](https://docs.sheetjs.com/docs/miscellany/license/), and [decimal.js](https://github.com/MikeMcl/decimal.js/). No framework or Supabase client upgrade is part of C1.

## C1 Cloud DEV Database-Test Contract

Create a dedicated guarded runner; Stage 01's allowlist is not valid for C1.

```text
package.json: "db:dev:c1:test": "node scripts/run-c1-cloud-dev-tests.mjs"
allowlist root: supabase/tests/database/c1/
required envelope: begin; ... rollback;
forbidden tokens: commit, db reset, migration repair, supabase_migrations,
                  real VQH IDs, include-seed, production references
execution: Supabase CLI db query --linked --file for fixed allowlisted files only
```

The runner must call `assertCloudDevTarget`, reject unrecognized arguments, normalize text EOL, validate the transaction envelope before connecting, and run only phase-authorized test files. It must not generate types or run `db:dev:push`.

Use a per-run synthetic fixture namespace: tenant `c1000000-0000-4000-8000-000000000010`; companies `c100...020` and `c100...021` in that tenant; a second tenant `c101...010` with company `c101...020`; importer/viewer/project-only actors ending `...901`, `...902`, and `...903`. Object keys are `c1-acceptance/<run-id>/<file-id>` in a private `taskovia-c1-financial` bucket. Tests prove same-tenant/different-company denial, different-tenant denial, no raw-file access with only `cost.read` or `project.read`, and short-lived signed links only after both source and file permission checks.

## File and Interface Map

| Area | Create | Modify |
| --- | --- | --- |
| Shared C1 contracts | `app/features/project-register/*`, `app/features/business-parties/*`, `app/features/engagements/*`, `app/features/costs/*`, `shared/schemas/costs/*`, `shared/schemas/files.ts`, `shared/constants/cost-permissions.ts` | `shared/constants/permissions.ts`, `shared/schemas/rbac.ts`, `shared/schemas/api-error.ts`, `app/repositories/contracts.ts` |
| Client repositories and UI | `app/repositories/http/http-cost-*.ts`, `app/pages/costs/index.vue`, `app/pages/costs/[engagementId].vue`, `app/components/costs/*`, `app/composables/useCosts.ts` | `app/plugins/repositories.client.ts`, `app/components/app/navigation-permissions.ts`, `app/services/auth/access-policy.ts`, `app/stores/company/company-access.store.ts` |
| Server | `server/features/project-register/*`, `server/features/business-parties/*`, `server/features/engagements/*`, `server/features/costs/*`, `server/features/files/*`, `server/api/companies/[companyId]/costs/**`, `server/api/companies/[companyId]/accounting-sources/**` | `server/utils/auth-context.ts`, `server/utils/api-error.ts`, `server/utils/supabase-client.ts` |
| Database and Cloud test harness | `supabase/migrations/*_taskovia_c1_foundation.sql`, `*_taskovia_c1_sources_files.sql`, `*_taskovia_c1_documents.sql`, `*_taskovia_c1_allocations_reporting.sql`, `supabase/tests/database/c1/*`, `scripts/run-c1-cloud-dev-tests.mjs` | `package.json`, `shared/types/database.types.ts` (only via authorized guarded generation) |
| Tests | `tests/unit/costs/*`, `tests/unit/server/costs/*`, `tests/unit/repositories/http-cost-*.spec.ts`, `tests/e2e/costs.spec.ts` | `tests/unit/auth/navigation-permissions.spec.ts`, `tests/unit/config/supabase-cloud-dev-runner.spec.ts` |

## Database Access and Index Contract

- Every new scoped table has an `(id, tenant_id, company_id)` uniqueness target for composite foreign keys and an index whose left prefix is `(tenant_id, company_id)`.
- Required list indexes include `(tenant_id, company_id, status, created_at, id)` for documents and sources, `(tenant_id, company_id, project_id, reporting_date, id)` and `(tenant_id, company_id, engagement_id, reporting_date, id)` for financial reads, and exact FK indexes for document, line, source version, selection, allocation, event, and file-link references.
- Partial indexes are allowed only where the query predicate is equally explicit: active occurrence claims, current/shared figure tails, mutable drafts, and unresolved review issues. Each partial index gets an `EXPLAIN` assertion in its C1 database test before it is retained.
- Summary reads use one consistent database projection/query snapshot. They do not fan out into independently timed aggregate queries, and a security-invoker view is used only when its RLS behavior is proven by SQL tests.

## Phase P1 — Secure Schema Contracts and Master-Data APIs

**Migration scope:** one CLI-generated foundation migration creates `projects`, `business_parties`, `project_engagements`, `engagement_components`, `company_cost_settings`, `cost_document_events`, and `cost_command_receipts`; adds scoped composite FKs, unique keys, RLS, revoke/grant policy, and disabled settings rows. It adds the twelve C1 permission codes to the catalog but assigns none to real accounts.

**Consumes:** active company membership, `PermissionCode`, `AuthenticatedHttpClient`, existing service/route/repository pattern.

**Produces:** `ProjectRegisterRepository`, `BusinessPartyRepository`, `EngagementRepository`, `CostConfigurationRepository`; strict schemas; private server contexts; master-data HTTP endpoints; a C1 test runner.

### Task P1.1: Write shared contracts and permission gates

**Files:**
- Create: `shared/schemas/costs/master-data.ts`, `shared/schemas/costs/commands.ts`, `app/features/project-register/project-register.types.ts`, `app/features/business-parties/business-party.types.ts`, `app/features/engagements/engagement.types.ts`
- Modify: `shared/constants/permissions.ts`, `shared/schemas/rbac.ts`, `app/repositories/contracts.ts`, `tests/unit/shared/cost-master-data.spec.ts`

**Interface:**

```ts
export type DecimalString = string
export interface ProjectRegisterRepository {
  list(): Promise<ProjectRegisterSummary[]>
  create(input: CreateProjectRegisterInput): Promise<ProjectRegister>
  update(id: string, input: UpdateProjectRegisterInput): Promise<ProjectRegister>
}
export interface EngagementRepository {
  list(projectId: string): Promise<EngagementSummary[]>
  create(projectId: string, input: CreateEngagementInput): Promise<Engagement>
  addComponent(engagementId: string, input: CreateComponentInput): Promise<EngagementComponent>
}
```

- [ ] Add failing schema tests for decimal-string rejection, required project/engagement scope, `legacy_import|manual` C1 origins, and every new permission code.
- [ ] Run `pnpm exec vitest run tests/unit/shared/cost-master-data.spec.ts`; expected RED because no schemas/permissions exist.
- [ ] Implement strict Zod schemas and types; do not add a generic workflow/project abstraction.
- [ ] Re-run the focused test; expected PASS. Commit the contract-only change.

### Task P1.2: Create forward-only foundation and guarded C1 database runner

**Files:**
- Create: `supabase/migrations/*_taskovia_c1_foundation.sql`, `scripts/run-c1-cloud-dev-tests.mjs`, `supabase/tests/database/c1/c1_foundation.test.sql`, `tests/unit/config/c1-cloud-dev-runner.spec.ts`
- Modify: `package.json`, `scripts/assert-cloud-dev-target.mjs` only if a reusable non-mutating guard export is needed

- [ ] Write failing runner tests proving fixed allowlist behavior, rejected `commit`/repair/reset text, and no Supabase spawn after an invalid fixture.
- [ ] Run `pnpm exec vitest run tests/unit/config/c1-cloud-dev-runner.spec.ts`; expected RED.
- [ ] Generate the migration with `pnpm exec supabase migration new taskovia_c1_foundation`; implement tables/FKs/RLS/permissions and the transaction-only C1 runner.
- [ ] Run focused runner tests and SQL static contract tests; expected PASS. Under later P1 authorization only, run `pnpm db:dev:target`, `pnpm db:dev:dry-run`, then `pnpm db:dev:push`, `pnpm db:dev:c1:test`, and `pnpm db:dev:types`; expected only the reviewed P1 migration applies, test fixtures roll back, and generated types show only reviewed C1 additions.

### Task P1.3: Implement master-data services, routes, HTTP repositories, and scoped navigation shell

**Files:**
- Create: `server/features/project-register/{project-register.repository.ts,project-register.service.ts,project-register.routes.ts}`, `server/features/business-parties/*`, `server/features/engagements/*`, `app/repositories/http/http-project-register-repository.ts`, `app/repositories/http/http-business-party-repository.ts`, `app/repositories/http/http-engagement-repository.ts`, matching `server/api/companies/[companyId]/**` routes
- Modify: `app/plugins/repositories.client.ts`, `app/components/app/navigation-permissions.ts`, `app/services/auth/access-policy.ts`, `tests/unit/server/*`, `tests/unit/repositories/http-*.spec.ts`, `tests/unit/auth/navigation-permissions.spec.ts`

- [ ] Write failing service/route tests for membership, exact permission, foreign-company 404, stale `expectedVersion`, and no C1 access when the module is disabled.
- [ ] Run the focused unit tests; expected RED.
- [ ] Implement server-first scope resolution and repository registry factories that obtain current company at request time; do not spread `PROTOTYPE_CONFIG` into C1.
- [ ] Re-run focused tests, then `pnpm test:unit && pnpm typecheck`; expected PASS. P1 exit: synthetic actor can create company-scoped master data through HTTP, cross-company attempts fail, and real companies still have C1 disabled.

## Phase P2 — Accounting Sources, Private Files, and Non-Posting Source Records

**Migration scope:** `file_objects`, private bucket/policies, `accounting_sources`, `accounting_source_versions`, `source_selections`, `source_reported_figures`, and `source_review_issues` with RLS, immutable transitions, locators, revision constraints, and source-only audit events.

**Consumes:** P1 company settings, master data, permission gates, command receipt/event base, guarded C1 runner.

**Produces:** `FileRepository`, `AccountingSourceRepository`, `SourceSelectionRepository`, `SourceFigureRepository`, `SourceReviewRepository`; private upload/finalize/preview/read-url API; source intake UI.

### Task P2.1: Implement private object lifecycle and static preview adapter

**Files:**
- Create: `server/features/files/{file.repository.ts,file.service.ts,file-preview.service.ts,file.routes.ts}`, `server/features/files/xlsx-preview.service.ts`, `shared/schemas/files.ts`, `tests/unit/server/files.spec.ts`, `tests/unit/server/xlsx-preview.spec.ts`
- Modify: `package.json`, `pnpm-lock.yaml`, `app/repositories/contracts.ts`, `server/utils/supabase-client.ts`

```ts
export interface FileRepository {
  createUploadIntent(input: CreateFileUploadIntent): Promise<FileUploadIntent>
  finalize(id: string, input: FinalizeFileInput): Promise<FileObject>
  preview(id: string, query: FilePreviewQuery): Promise<FilePreviewPage>
  createReadUrl(id: string): Promise<{ url: string; expiresAt: string }>
}
```

- [ ] Add failing tests using synthetic buffers for valid XLSX cached values, missing cached formula, `#REF!`, hidden sheet metadata, 20 MiB/type limits, zip-bomb limits, and CRLF-safe source metadata; expected RED.
- [ ] Install only the pinned SheetJS and decimal dependencies above; inspect lockfile and license/security output.
- [ ] Implement pending→ready finalization from server-observed metadata, server-only parser limits, escaped static preview, `limited|unsupported|failed` states, and 60-second no-store signed URLs.
- [ ] Run focused tests; expected PASS. Under P2 Cloud authorization, prove a `cost.read` or `project.read` actor cannot read raw bytes, metadata, preview, URL, or storage object.

### Task P2.2: Implement source-first intake, selections, figures, and issue queue

**Files:**
- Create: `server/features/costs/{accounting-source.repository.ts,accounting-source.service.ts,source-review.service.ts}`, `shared/schemas/costs/sources.ts`, `app/repositories/http/http-accounting-source-repository.ts`, `app/pages/costs/sources.vue`, `app/components/costs/SourceWizard.vue`
- Modify: `app/repositories/contracts.ts`, `app/plugins/repositories.client.ts`, `server/api/companies/[companyId]/accounting-sources/**`, `tests/unit/server/cost-sources.spec.ts`, `tests/unit/repositories/http-cost-sources.spec.ts`

- [ ] Write failing tests for upload before project/engagement, immutable shared version/figure, normalized Unicode locator uniqueness, `pending` selection, source share without financial activation, and figure revision history.
- [ ] Run focused tests; expected RED.
- [ ] Implement source commands with idempotency and optimistic versioning. Ensure `report_total|subtotal` stays non-posting and cannot become a financial line by renaming fields.
- [ ] Re-run tests and `pnpm typecheck`; expected PASS. P2 exit: a synthetic mixed-company workbook can be stored/shared/read only by `cost.source.read` + `cost.file.read`, with no KPI change.

### Task P2.3: Validate database isolation and source boundaries

**Files:**
- Create: `supabase/migrations/*_taskovia_c1_sources_files.sql`, `supabase/tests/database/c1/c1_sources_files_security.test.sql`, `supabase/tests/database/c1/c1_sources_files_commands.test.sql`
- Modify: `shared/types/database.types.ts` only after authorized generation

- [ ] Add SQL tests for I01, I03, I13, I15, I19, I20, I21, and I24 using the defined two-company/two-tenant fixture.
- [ ] Run the C1 runner test against a deliberately invalid fixture locally; expected guard refusal before Cloud connection.
- [ ] Add migration policies/constraints/RPCs and run the authorized dry-run/push/C1 SQL sequence.
- [ ] Re-run source HTTP/unit tests and Cloud C1 SQL tests; expected PASS with every fixture transaction rolled back.

## Phase P3 — Financial Documents, Publication, and Provenance

**Migration scope:** `cost_documents`, `cost_document_lines`, `cost_document_files`, `cost_line_source_links`, publication/confirmation/dispute events, immutable line/source claim constraints, and atomic command functions.

**Consumes:** P1 master data and P2 ready/shared sources, source selections, source issues, file objects, and receipts.

**Produces:** `CostDocumentRepository`, `CostDocumentService`, document/evidence/correction draft API, publish validation and provenance views.

### Task P3.1: Define financial document contracts and exact arithmetic boundaries

**Files:**
- Create: `shared/schemas/costs/documents.ts`, `shared/schemas/costs/decimal.ts`, `app/features/costs/cost-document.types.ts`, `tests/unit/costs/document-validation.spec.ts`
- Modify: `shared/schemas/api-error.ts`, `app/repositories/contracts.ts`

- [ ] Write failing tests for each line kind, decimal scale, tax basis, source confirmation, opening cutoff, immutable publication, and rejection of legacy `reported_balance` financial lines.
- [ ] Run the focused test; expected RED.
- [ ] Implement schemas and canonical decimal-string utilities using `decimal.js`; expose no `number`-based financial API.
- [ ] Re-run focused tests; expected PASS.

### Task P3.2: Build publication, confirmation, evidence, and correction commands

**Files:**
- Create: `server/features/costs/{cost-document.repository.ts,cost-document.service.ts,cost-document.routes.ts,provenance.service.ts}`, `app/repositories/http/http-cost-document-repository.ts`, `tests/unit/server/cost-document-publication.spec.ts`
- Modify: `server/api/companies/[companyId]/cost-documents/**`, `app/repositories/contracts.ts`, `app/plugins/repositories.client.ts`

```ts
publishDocument(context, documentId, input): Promise<{ documentId: string; version: bigint; publishedAt: string }>
confirmSource(context, documentId, input): Promise<CostDocument>
createEvidenceDraft(context, documentId, input): Promise<CostDocument>
createCorrectionDraft(context, documentId, input): Promise<CostDocument>
```

- [ ] Write failing service tests for I02–I08, I11–I12, I16–I18, and I23: no direct published writes, no source share posting, exactly-once activation, one active occurrence claim, and evidence without duplicated money.
- [ ] Run focused tests; expected RED.
- [ ] Implement transaction/RPC command paths, locks in the documented order, server revalidation at publish, source links, audit, and receipt replay.
- [ ] Re-run tests; expected PASS. P3 exit: a confirmed synthetic document publishes once with provenance, an evidence document adds links only, and a correction preserves the old record.

### Task P3.3: Validate publication and provenance in Cloud DEV

**Files:**
- Create: `supabase/migrations/*_taskovia_c1_documents.sql`, `supabase/tests/database/c1/c1_documents_commands.test.sql`, `supabase/tests/database/c1/c1_documents_security.test.sql`, `supabase/tests/database/c1/c1_documents_concurrency.test.sql`

- [ ] Add failing DB assertions for business-key uniqueness, opening cutoff overlap, source-version shared/ready guards, source claim uniqueness, and atomic receipt/event/coverage behavior.
- [ ] Run local static/unit tests; expected RED before migration/command implementation.
- [ ] Implement forward migration and authorized guarded Cloud sequence.
- [ ] Re-run C1 SQL, HTTP, and type generation checks; expected PASS with A04–A11, A16–A21, A30–A33, A38, A41–A42, A51, A53, A55–A56, A58–A60 evidenced.

## Phase P4 — Allocations, Corrections, Disputes, and Coverage

**Migration scope:** `cash_allocations`, `cost_coverage_assertions`, correction dependency guards, dispute projections, allocation/reversal constraints, report-supporting indexes.

**Consumes:** published documents and lines, source links/issues, receipts/events, P1–P3 scope constraints.

**Produces:** allocation/correction/dispute/coverage commands and current-state projections that return `complete|partial|unavailable|conflicted`.

### Task P4.1: Implement allocation and correction dependency logic

**Files:**
- Create: `server/features/costs/{allocation.service.ts,correction.service.ts}`, `shared/schemas/costs/allocations.ts`, `tests/unit/costs/allocation-arithmetic.spec.ts`, `tests/unit/server/cost-corrections.spec.ts`
- Modify: `server/features/costs/cost-document.service.ts`, `app/repositories/contracts.ts`, `app/repositories/http/http-cost-document-repository.ts`

- [ ] Write failing F01, F02, F08, F09 tests and allocation limit/race tests: third-party acceptance required; no negative payable clamp; reversal is append-only; no cross-engagement move.
- [ ] Run focused tests; expected RED.
- [ ] Implement decimal aggregate/allocation validation and correction dependency preview; preserve cash when replacement is insufficient.
- [ ] Re-run focused tests; expected PASS.

### Task P4.2: Implement coverage, dispute, comparison, and source-review effects

**Files:**
- Create: `server/features/costs/{coverage.service.ts,comparison.service.ts,dispute.service.ts}`, `shared/schemas/costs/reporting.ts`, `tests/unit/costs/coverage-comparison.spec.ts`
- Modify: source-review service and document service

- [ ] Write failing tests for partial/unavailable/conflicted outputs, no unknown→zero coercion, F03–F07/F10, not-comparable source totals, issue-driven coverage downgrade, and no automatic recovery to complete.
- [ ] Run focused tests; expected RED.
- [ ] Implement append-only assertions/events and comparison reason codes; return source figures separately from normalized KPI amounts.
- [ ] Re-run focused tests; expected PASS.

### Task P4.3: Add allocation/coverage migration and C1 race proofs

**Files:**
- Create: `supabase/migrations/*_taskovia_c1_allocations_reporting.sql`, `supabase/tests/database/c1/c1_allocations_coverage.test.sql`, `supabase/tests/database/c1/c1_cross_company_security.test.sql`

- [ ] Add SQL tests for I07, I09–I10, I12, I14, I18–I19, I22–I24 plus concurrent allocation/publish fixtures.
- [ ] Implement migration, locks, indexes, RLS, and command RPCs; no view bypasses RLS.
- [ ] Under P4 Cloud authorization run guarded dry-run/push/C1 tests and advisor checks; expected only reviewed migration, all synthetic fixtures rolled back, no new security advisor error.
- [ ] P4 exit: allocation, correction, dispute, and coverage invariants have unit, HTTP, and Cloud DB evidence.

## Phase P5 — Reporting and Complete Operational UI

**Migration scope:** no unreviewed schema expansion. Add only a reviewed secure-invoker view or indexed server projection if P4 read performance evidence requires it.

**Consumes:** P1–P4 repositories, `GET /costs/summary`, report/comparison contracts, active company store.

**Produces:** company-aware cost navigation, dashboard, engagement detail, source workflows, document/correction workflows, and mobile-safe displays.

### Task P5.1: Implement server report/query projection and HTTP repository

**Files:**
- Create: `server/features/costs/reporting.repository.ts`, `server/features/costs/reporting.service.ts`, `app/repositories/http/http-cost-report-repository.ts`, `tests/unit/server/cost-reporting.spec.ts`, `tests/unit/repositories/http-cost-report-repository.spec.ts`
- Modify: `server/api/companies/[companyId]/costs/summary.get.ts`, `app/repositories/contracts.ts`, `app/plugins/repositories.client.ts`

- [ ] Write failing tests for filters/asOf/basis, cursor limits, F01–F10, source-only figures, and company switch cancellation.
- [ ] Run focused tests; expected RED.
- [ ] Implement one consistent aggregate query/projection per summary, with server-validated filters and decimal-string output.
- [ ] Re-run tests; expected PASS.

### Task P5.2: Implement C1 UI without prototype fallback

**Files:**
- Create: `app/pages/costs/index.vue`, `app/pages/costs/[engagementId].vue`, `app/pages/costs/sources.vue`, `app/components/costs/{CostDashboard,EngagementDetail,SourceWizard,FinancialDocumentWizard,SourcePreview,CoveragePanel}.vue`, `app/composables/useCosts.ts`, `tests/e2e/costs.spec.ts`
- Modify: `app/components/app/navigation-permissions.ts`, `app/services/auth/access-policy.ts`, `app/plugins/repositories.client.ts`, `tests/e2e/app-shell-navigation.spec.ts`

- [ ] Write failing E2E tests for a cost-only viewer reaching `/costs`, source/file denials, source-first intake, unknown/partial labels, stale company response rejection, and mobile keyboard access.
- [ ] Run `pnpm exec playwright test tests/e2e/costs.spec.ts`; expected RED.
- [ ] Implement permission-first navigation and scoped request generation; clear pending preview/signed URL/candidates on company switch or logout.
- [ ] Re-run focused E2E plus `pnpm test:e2e`; expected PASS. P5 exit: all C1 user journeys are HTTP-backed and no page can expose raw source data without both source/file permissions.

## Phase P6 — Full C1 Acceptance and Handoff

**Migration scope:** none unless an explicitly reviewed corrective forward migration is required by failed acceptance evidence.

**Consumes:** all P1–P5 commands, C1 guarded runner, acceptance map, synthetic fixtures.

**Produces:** full A01–A62/I01–I24/F01–F10 evidence, phase report, updated progress/acceptance map, remote review checkpoint.

### Task P6.1: Execute the complete acceptance matrix

**Files:**
- Create: `supabase/tests/database/c1/c1_full_acceptance.test.sql`, `tests/e2e/costs-full-acceptance.spec.ts`, `docs/implementation/taskovia-c1/phase-reports/p6-full-acceptance.md`
- Modify: `docs/implementation/taskovia-c1/acceptance-map.md`, `docs/implementation/taskovia-c1/progress.md`

- [ ] Write/complete synthetic acceptance tests for every mapped case and invariant before claiming a row PASS.
- [ ] Under explicit P6 authorization run target/auth/status, dry-run, reviewed push, C1 DB tests, type generation, unit/typecheck/lint/build, and C1 E2E.
- [ ] Record each command, exact SHA, source migration list, run-owned fixture namespace, result, and any unrun case. A report-only commit is not an application test run.
- [ ] P6 exit: all mandatory rows have evidence; remote branch is pushed and verified; no Production, real VQH data, or C2/C3 work occurred.

## Verification by Phase

| Phase | Deterministic checks before Cloud | Cloud DEV checks after explicit authorization | Demonstrable exit |
| --- | --- | --- | --- |
| P1 | focused Vitest, `pnpm typecheck`, `pnpm lint` | target, auth-check, dry-run, reviewed push, `db:dev:c1:test`, types | scoped master data via HTTP; module disabled for real companies |
| P2 | file/source unit + repository tests | P1 checks plus source/file C1 SQL tests | source-first upload/share has no financial effect and private-file denial works |
| P3 | document/provenance unit + HTTP tests | document/claim/concurrency C1 SQL tests | single activation and immutable provenance/correction evidence |
| P4 | arithmetic/coverage/correction unit tests | allocation/coverage/security/race C1 SQL tests, advisors | F01–F10 and all report state transitions evidenced |
| P5 | focused Playwright then `pnpm test:e2e` | no new write unless a reviewed migration is needed | cost-only UI and company-switch safety |
| P6 | `pnpm verify:app`, `pnpm test:e2e`, full C1 tests | exact authorized complete sequence | full acceptance report with no unsubstantiated PASS |

## Plan Self-Review

- Every requirement is allocated in `docs/implementation/taskovia-c1/acceptance-map.md`; multi-layer cases remain partial until P6 records all evidence.
- C2/C3 references are compatibility boundaries only. A34 is a forward-compatible C1 fixture/contract and does not create C2/C3 migrations or engines.
- No task uses a local database, a mock runtime C1 repository, a generic import-batch system, an Office/AI viewer, a real workbook, or a production operation.
