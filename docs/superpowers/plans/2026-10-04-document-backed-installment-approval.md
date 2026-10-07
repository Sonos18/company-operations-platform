# Taskovia Document-backed Installment Approval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. User review of this plan and selection of execution method are required before execution. Recommended here: Native/serial under Codex control; AGY handles only the bounded UI task on the exact model specified below.

**Goal:** Replace the cost source/draft UX with evidence-backed requests, project-manager approval of each installment, proof-backed payments/refunds and truthful net cash reporting while preserving all history.

**Architecture:** Add immutable request versions, approved installments, authorization consumption, adjustments and manager assignments around the existing cost/evidence model. Ordinary payments are new; existing subcontract payments remain their single cash source. Additive changes stay inactive until an end-to-end replacement, legacy writer gates and reconciliation controls pass.

**Tech Stack:** Existing Nuxt 4.3.1, Vue 3.5.28, TypeScript, Zod 4, Supabase/PostgreSQL/private Storage, decimal.js 10.6.0, exceljs 4.4.0, Vitest 4.1.9, Playwright 1.61.1; Node 24.x and pnpm 10.29.3. No new package or OCR provider is assumed.

**Spec:** Approved written specification, Library identity `libfile_7c3ae57300908191b90b647edf655951`, version **2**, file `file_00000000bfec822f99e59612e410b312`; [read/download approved specification](https://chatgpt.com/api/library/files/libfile_7c3ae57300908191b90b647edf655951/download). Intended repository companion: `docs/superpowers/specs/2026-10-04-document-backed-installment-approval-design-draft.md`. Executor must read version 2, not silently accept a later version.

## Global Constraints

- “Chi ròng” = confirmed valid outgoing − confirmed actual refunds; gross “Đã chi” and “Đã thu hồi” remain separate.
- Accountant reviews extraction before submission. Every request has a party/VQH team and at least one finalized original supporting document; every payment/refund has appropriate actual-payment/receipt proof.
- Only the current assigned project manager approves/returns installments, contract adjustments and refund/correction requests. Director assigns/reassigns managers and receives notifications; no second director approval.
- Manager handover retains the pending immutable snapshot, adds assignment audit, removes old authority and requires no accountant resubmission.
- Contract hard cap includes all authorized installments: consumed plus remaining. Refund/correction never automatically restores installment authority or contract capacity.
- Completed projects cannot receive a new/increased obligation or cap. Settlement is limited to prior approved remaining authority; linked refunds/corrections cannot create outflow or restore authority.
- Original records/files and provenance remain. No invented historic approvals/payments or balancing entries. Unknown/unreconciled is distinct from zero.
- Director `vqh-director@taskovia.invalid` receives the notification; if inactive, approval succeeds and notification stays undelivered to that same identity.
- Supabase Cloud DEV only: `gtgljlnhwvhqdnwrfdfj`. No local DB fallback. Production `mztakwksmqspjabpaigk` is a separate boundary with no permission granted here.
- All Cloud DEV DDL, fixtures, role grants, reconciliation writes and activation require explicit target/operation authorization, including rollback rehearsals. Use guarded `db:dev:*` commands.
- OCR provider/privacy/retention/cost approval is a separate integration gate. Synthetic fixture adapters are allowed by the future code task; no real external OCR calls/data transfer until separately approved.
- Preserve the old flow until the whole secure replacement is ready; do not ship new UX with legacy RPC bypass still enabled.
- This artifact authorizes planning only. No current code changes, migration application, grants, deployment or test execution are claimed.

## Review Focus

These five conditions need explicit tests in the tasks named below:

1. Two installments fit separately but their approvals together exceed the same cap: only one can win; Task 4 SQL/concurrency.
2. Cash correction after a recorded refund would make refunds exceed true outgoing, or would recover spend authority: conflict, no fake inflow/capacity; Task 5.
3. Company/project switches while extraction, upload or approval is pending: old responses/files never attach to the new scope; Tasks 3, 7.
4. Director is inactive at approval and reactivated later: durable same-recipient undelivered event, single later delivery, no fallback administrator; Tasks 4, 7.
5. Completed project receives proof for an existing settlement/refund/correction: permit only the narrow command target; forged request or unrelated upload remains blocked; Tasks 3, 5.

---

## Baseline, ownership and execution environment

Read-only planning observed `origin/main = 1011c2b9786448c687e1516e2c58afbbe59b8c06` (“Release accepted project, HR invitation, and sidebar changes (#27)”). Its tracked tree matches accepted DEV `45dfeda42d53f932e9c8f081db0e69d33517cf10` (`git diff --stat` produced no tree changes). Remote `/data/taskovia` working HEAD remains `ab2dcbd...`; do not reset it to the release. Recheck remote refs and merge status before execution; if HRfix is subsequently merged, use the new agreed main SHA and rerun relevant contracts.

Local Codex desktop is the controller. Source edits, targeted tests and build run on `dev-worker-recovery` through installed official Insta CLI, always agent mode; for example:

```text
insta --agent compute exec --branch dev --timeout 30 dev-worker-recovery -- sh -c 'cd /data/taskovia; git rev-parse refs/remotes/origin/main'
```

Execution uses an isolated, narrow worktree from the agreed main SHA. Do not modify retained integration worktrees, `/data/taskovia` working files or the local dirty checkout. Record worktree owner/base/path; reuse suitable managed worktrees only with their owner’s agreement. No service restart, environment rebinding, upgrade, package install or new worker is part of this plan.

Observed disk: `/data` 126 MB free of 974 MB; `/tmp` shares a filesystem with about 2.2 GB free. Recheck before materializing. Reuse the worker’s verified Node/pnpm and compatible shared node_modules/store at its resolved existing path; do not invent a shared path or mutate another checkout’s dependencies. Place worktree/build/test output on verified ephemeral space when compatible. Serialize Nuxt prepare/typecheck/build when shared artifacts could collide. Verify Nuxt output paths and symlinks before redirecting them; do not send a build into the small persistent volume. If dependencies cannot be reused safely or space is insufficient, stop that phase and report the exact resource need.

HRfix has another active owner. No changes to `server/features/employees/*`, employee invitation APIs, employee onboarding/offboarding behavior or their migrations without a scoped coordination agreement. Shared hot files (`shared/constants/permissions.ts`, `shared/types/database.types.ts`, repository registry, navigation, package scripts and migration ordering) have one integrator. Integrate HRfix first where it changes the same authentication/onboarding contract; otherwise maintain disjoint commits and rebase through a reviewed diff.

AGY is UI-only on **Gemini 3.8 Flash High**, reasoning **high**. Verify that exact selection before its turn; unavailable model blocks AGY work rather than silently selecting a substitute. Codex owns all schema, SQL/RLS, API, non-visual contracts, security tests and final review. AGY may consume stable typed repositories, create Vue screens/styles and scoped UI tests; it cannot edit migrations, Auth/RBAC grants, finance semantics, backend or package dependencies.

Current budget is **$4**, not assumed replenished. Baseline/budget preflight records actual current allowance and consumption without exposing credentials. Work proceeds in measurable checkpoints; estimates are not guarantees of whole-scope completion. Recheck cost after each task group and before build/browser/AGY runs. Stop at a passing committed checkpoint before funds run out; report remaining tasks and estimated resource need, do not increase ceilings, add services or silently downgrade required checks.

## Task groups and dependency order

| Group | Deliverable | Depends on | Parallel rule |
| --- | --- | --- | --- |
| A: Tasks 1–2 | Contracts, guarded test harness, additive schema/RBAC | agreed baseline | serial shared schema/migrations |
| B: Tasks 3–5 | Evidence scope, requests/approval/cap, payments/refunds | A | serial command/lock invariants |
| C: Tasks 6–7 | Historical projection/reconciliation and scan/basis adapter | B contracts | separate files can proceed independently after interfaces freeze; budget defaults to serial |
| D: Task 8 | AGY UI against reviewed backend contracts | B+C contract checkpoint | one UI worktree; no shared hot-file concurrent editing |
| E: Tasks 9–10 | Authorized Cloud DEV verification, onboarding/reconciliation, staged acceptance | A–D | one DB integrator; no concurrent migrations/grants/reconciliation |
| F: Task 11 | Final review, release packet and explicit activation gate | E | serial; deployment/mutation not implicit |

No subagents or AGY are launched by writing this plan. User selects execution after review. Each task owns a targeted failing-test/minimal-implementation/passing-test cycle; checkpoint commits contain only that task’s scoped files.

## Shared interfaces and file map

New public command schemas live in `shared/schemas/costs/cost-workflow.ts`; no actor/tenant/permission/audit identity from clients. `UUID` is a UUID-validated string; `MoneyText` is an exact nonnegative decimal string validated against existing project currency/scale. Return signed decimal text for net cash; never use JavaScript floating point for money. Reuse existing finance money helpers.

Define:
- `WorkflowScope { companyId: UUID; projectId: UUID }`.
- `CostBasisInput`: discriminated `materials` (item rows/unit/quantity/rate/site delivery), `subcontract` (existing subcontract ID/acceptance/retention basis), `direct_labor` (week start/team/worker days/rate/allowance), `machinery`/`other` (reviewed basis lines). No invented VAT/payroll formula.
- `CostRequestInput { partyId: UUID; partyKind: 'organization'|'crew'; crewOwnership?: 'vqh_internal'|'external'; categoryId: UUID; contractVersionId?: UUID; amount: MoneyText; currencyCode: string; basis: CostBasisInput; evidenceFileIds: UUID[] }`. Require ownership for crews; do not backfill all existing crews as VQH.
- `CommandVersion { expectedVersion: number }`; optimistic versions are nonnegative integers. Header `idempotency-key` is a UUID, reuse current receipt conventions.
- `CostRequestView { id: UUID; version: number; submittedVersionId: UUID|null; status: 'working'|'submitted'|'returned'|'approved'; partyId: UUID; amount: MoneyText; currencyCode: string; evidenceFileIds: UUID[]; assignmentVersion: number|null; basis: CostBasisInput; installment: {id:UUID; authorized:MoneyText; consumed:MoneyText; remaining:MoneyText}|null; payments: WorkflowPaymentView[] }`. `WorkflowPaymentView {id:UUID; amount:MoneyText; refunded:MoneyText; correctedCash:MoneyText; currencyCode:string; paymentDate:string; evidenceFileIds:UUID[]}`; reads are scope/role filtered.
- `WorkflowCommandResult { requestId?: UUID; installmentId?: UUID; paymentId?: UUID; adjustmentId?: UUID; version: number; replayed: boolean }`.
- `CashAdjustmentInput = {kind:'refund';requestedAmount:MoneyText;reason:string;evidenceFileIds:UUID[];expectedVersion:number} | {kind:'correction';correctedOutgoing:MoneyText;reason:string;evidenceFileIds:UUID[];expectedVersion:number}`. Neither branch changes project/party/obligation/consumption; service reads these from source payment.
- `ContractBasisInput {partyId:UUID;reference:string;referenceAmount:MoneyText;currencyCode:string;evidenceFileIds:UUID[]}` creates the initial reviewed reference, never an approved installment. `ContractAdjustmentInput {expectedVersion:number; proposedCap:MoneyText; reason:string; evidenceFileIds:UUID[]}`; `WorkflowPartyOption {id:UUID; name:string; kind:'organization'|'crew'; crewOwnership:'vqh_internal'|'external'|null}`.
- `WorkflowCashFacts {currencyCode:string;moneyScale:number;outgoing:{id:UUID;validAmount:MoneyText}[];refunds:{id:UUID;paymentId:UUID;confirmedAmount:MoneyText}[];installments:{id:UUID;authorized:MoneyText;consumed:MoneyText}[];unreconciledCount:number;coverage:'complete'|'partial'|'not_recorded'}`. Corrections determine validAmount in the scoped projection; refunds never reduce consumption.
- `WorkflowContext`: server-resolved active actor/tenant/company/permissions/requestId and user-bound DB client from `server/features/c1-master-data/context.ts`.
- `CashSummary { grossPaid: MoneyText; confirmedRefunds: MoneyText; netCash: string; approvedUnspent: MoneyText; unreconciledCount: number; coverage: 'complete'|'partial'|'not_recorded' }`. Zero and unknown use the existing observation conventions rather than coercing null to zero.

New focused feature files: `server/features/costs/workflow/cost-workflow.{service,repository,routes}.ts`, `cost-workflow-money.ts`, `cost-workflow-queries.ts`; extraction files `server/features/costs/extraction/{cost-extraction-adapter,cost-extraction.service,structured-cost-extraction}.ts`; no separate generic workflow engine. Add `app/repositories/http/http-cost-workflow-repository.ts`, register through `app/repositories/contracts.ts` and `app/plugins/repositories.client.ts`.

SQL/RPC commands below use current `target_company_id`, `target_project_id`, typed `target_input`, `target_idempotency_key`, `target_request_id` conventions; IDs/expected versions appear in named params where specified. User-bound entrypoints resolve actor from authentication and check active membership at each command/replay.

Migration names below are planned file reservations, not applied files. A single integrator revalidates them against main and Cloud DEV ledger at execution, allocates an ordered unused timestamp if HRfix has occupied/passed one, and updates references before applying. Never edit an applied migration.

---

### Task 1: Pin interfaces and money/state invariants

**Files:** Create `shared/schemas/costs/cost-workflow.ts`, `server/features/costs/workflow/cost-workflow-money.ts`; test `tests/unit/costs/cost-workflow.spec.ts`, `tests/unit/server/cost-workflow-money.spec.ts`.

**Interfaces:** Produce schemas/types above; `evaluateInstallmentCapacity(cap: MoneyText, authorized: MoneyText[], proposed: MoneyText): { allowed: boolean; available: MoneyText }`; `summarizeWorkflowCash(input: WorkflowCashFacts): CashSummary`, with facts carrying actual outgoing/refund/correction and consumption separately.

- [ ] Write failing schema tests: party missing, evidence empty, negative amount, unsupported currency scale, browser actor/tenant fields rejected; contractor crew versus VQH crew explicit.
- [ ] Write failing money assertions: cap 100/authorized 30 permits 70 and rejects 71; paid 10/refund 2 => gross 10/refund 2/net 8 while remaining authority stays 20; duplicate fact identity counted once; correction is not refund; exact high-precision decimal strings survive.
- [ ] Run `pnpm test:unit tests/unit/costs/cost-workflow.spec.ts tests/unit/server/cost-workflow-money.spec.ts`; expect failure from missing contract/helpers, not unrelated environment.
- [ ] Implement the schemas and exact-decimal functions using existing helpers/decimal.js; no DB or UI assumptions.
- [ ] Rerun the same tests, expect zero failures; commit only these contracts/tests. Checkpoint A1: interfaces frozen for Tasks 2–8.

### Task 2: Additive schema, minimal permissions and safe test harness

**Files:** Create `supabase/migrations/20261004210000_c1_cost_workflow_foundation.sql`, `20261004210100_c1_cost_workflow_security.sql`; `supabase/tests/database/c1/c1_cost_workflow_security.test.sql`; modify `shared/constants/permissions.ts`, `scripts/run-c1-cloud-dev-tests.mjs`; create `scripts/run-c1-cost-workflow-concurrency.mjs`; modify `package.json`; tests `tests/unit/config/c1-cost-workflow-runner.spec.ts`.

**Interfaces:** Add generic company/project manager-assignment history, immutable request versions/decisions, approved installments/consumption, ordinary payments, refund/correction events, contract versions/adjustments, scoped notification recipient/events, extraction results and reconciliation mapping. Existing subcontract cash remains canonical; map its payment ID instead of duplicating cash rows. Add nullable crew ownership classification for parties; existing unclassified crews require explicit review before VQH selection, with no blanket ownership backfill. Company workflow mode `legacy|document_backed_v1` defaults to legacy; new test fixtures can activate their synthetic company. RLS is deny-by-default across scope; no real VQH role/account assignment in schema migrations.

Permission names: `project.cost_manager.assign`, `cost.request.submit`, `cost.request.decide`, `cost.request.read`, `cost.request.file.read`, `cost.party.read`, `cost.notification.read`; retain existing `cost.record_cash`/`cost.correct` subject to workflow gates. Manager decision also requires project assignment; a company permission alone never grants all-project approval. Director assignment requires designated-director capability, not broad company_admin substitution.

- [ ] Write failing runner tests rejecting wrong project ref, unknown SQL fixture, real VQH IDs, COMMIT in rollback pgTAP, reset/seed/repair, trigger disable and broad cleanup.
- [ ] Run `pnpm test:unit tests/unit/config/c1-cost-workflow-runner.spec.ts`; expect targeted FAIL.
- [ ] Add forward-only additive migrations with stable IDs/FKs/unique receipt keys, immutable histories and scope constraints; identify existing legacy parent and subcontract resolution invariants in comments/tests, preserve them.
- [ ] Extend guarded runners with new rollback-only SQL allowlist and reserved synthetic namespace not used by earlier suites. Add `db:dev:c1:cost-workflow:test` and `db:dev:c1:cost-workflow:concurrency` scripts, both asserting canonical DEV before execution. Tests may create records inside rollback; concurrency requires separately authorized persistent fixtures and inventory, not imaginary zero cleanup.
- [ ] Rerun targeted unit runner checks; commit. **No SQL applied here.** PostgreSQL execution belongs to Task 9 after authorization. Checkpoint A2: dry schema/test-harness review accepted.

### Task 3: Request evidence access and party lookup

**Files:** Modify `shared/schemas/costs/cost-evidence.ts`, `server/features/costs/evidence/cost-evidence.{repository,service,routes}.ts`; create `supabase/migrations/20261004210200_c1_cost_request_evidence.sql`; tests `tests/unit/server/cost-workflow-evidence.spec.ts`, `supabase/tests/database/c1/c1_cost_workflow_evidence.test.sql`. Add scoped lookup in `server/features/costs/workflow/cost-workflow-queries.ts`.

**Interfaces:** `listWorkflowParties(context, projectId): Promise<WorkflowPartyOption[]>` read-only lookup, no `party.manage` side effects; `linkRequestEvidence(context, requestId, version, fileIds, key): Promise<WorkflowCommandResult>`. Extend existing upload-intent/finalize/read-url contracts with discriminated target `request|payment|adjustment`; original integrity/finalization stays server verified. Add explicit quotation kind without relabeling existing originals.

- [ ] Fail tests for zero supporting evidence, wrong project/tenant file, unfinalized file, wrong manager, unrelated ordinary viewer and signed URL after assignment revocation. Review Focus 3: a late upload response cannot attach to a changed request scope.
- [ ] Run `pnpm test:unit tests/unit/server/cost-workflow-evidence.spec.ts tests/unit/server/cost-evidence.service.spec.ts`; confirm targeted new failures.
- [ ] Implement scoped evidence links/reads for working requests and immutable submitted versions; signed URLs remain short-lived and role-controlled. Extend only the guarded verification boundary, no generic service-role write shortcut.
- [ ] Implement narrow completed-project upload/link checks requiring existing allowed settlement/adjustment identity and transaction scope; deny generic new-request upload.
- [ ] Pass the same unit tests; SQL assertions queued for Task 9. Commit. Checkpoint B1: accountant/current manager can read preapproval documents, unauthorized readers cannot.

### Task 4: Manager assignments, requests, contract caps and approvals

**Files:** Create workflow service/repository/routes, `supabase/migrations/20261004210300_c1_cost_workflow_request_commands.sql`; tests `tests/unit/server/cost-workflow-requests.spec.ts`, `cost-workflow.routes.spec.ts`, `supabase/tests/database/c1/c1_cost_workflow_requests.test.sql`.

**Interfaces:** Service methods `assignManager(context, projectId, {managerUserId,expectedAssignmentVersion,reason}, key)`, `createRequest(context,projectId,CostRequestInput,key)`, `updateRequest(context,requestId,input & CommandVersion)`, `submitRequest(context,requestId,CommandVersion,key)`, `decideRequest(context,requestId,{submittedVersionId,decision:'approve'|'return',reason?},key)`, `createContractBasis(context,projectId,ContractBasisInput,key)` and `submitContractAdjustment(context,projectId,contractId,ContractAdjustmentInput,key)` and `decideContractAdjustment(context,projectId,contractId,adjustmentId,{submittedVersionId,decision:'approve'|'return',reason?},key)`, all Promise of the defined view/result. `listRequests(context,projectId):Promise<CostRequestView[]>` and `readRequest(context,projectId,requestId):Promise<CostRequestView>` supply approved installment/payment history without a separate cash store.

Routes under `server/api/companies/[companyId]/projects/[projectId]/cost-workflow/`: `manager.put.ts`, `parties.get.ts`, `requests/index.get.ts`, `requests/index.post.ts`, `requests/[requestId].get.ts`, `requests/[requestId].patch.ts`, `requests/[requestId]/submit.post.ts`, `requests/[requestId]/decisions.post.ts`, `contracts/index.post.ts`, `contracts/[contractId].get.ts`, `contracts/[contractId]/adjustments/index.post.ts`, `contracts/[contractId]/adjustments/[adjustmentId]/decisions.post.ts`. Each wrapper delegates to reviewed routes and server context, never accepts actor fields.

- [ ] Write failing tests: initial contract/quotation reference requires accountant review and finalized evidence, links to the same basis on reuse, never creates payment authorization; duplicates/reference ambiguity require review, never silently create parallel financial facts. Existing subcontract basis reuses its original identity/value. No manager blocks submission; accountant cannot decide; director cannot second-approve; missing party/evidence blocks; return requires reason; immutable submitted version; manager handover keeps snapshot without resubmission; old manager denied.
- [ ] Add money/cap tests and SQL race scenarios: separate pending 70 and 70 against available 70; submit/approve recheck, only one approval fits; amendment approved by current manager before higher cap; cap decrease below authorized denied; completion rejects new installment/increase.
- [ ] Run `pnpm test:unit tests/unit/server/cost-workflow-requests.spec.ts tests/unit/server/cost-workflow.routes.spec.ts`; expect targeted FAIL.
- [ ] Implement RPC receipt/auth check and lock order: project state → current manager assignment → contract cap → request version → decision/approved installment. Coordinate with existing completion locking; lock shared scope before checks, use compatible PostgreSQL lock modes, avoid a new category/project lock inversion. A decision and manager reassignment must serialize against the same assignment version.
- [ ] Atomically insert decision/installment/receipt/audit and director notification with unique event+recipient. Inactive director leaves undelivered event to the same ID; reactivation exposes it through authenticated scoped reads, no external dispatcher. Add `server/api/companies/[companyId]/cost-notifications/index.get.ts` and `[notificationId]/read.post.ts`, with read marker idempotency.
- [ ] Pass unit tests, queue SQL/races for Task 9, commit. Checkpoint B2: approval alone changes no cash; contract approval alone authorizes no installment.

### Task 5: Proof-backed cash, corrections and settlement; close bypass at activation

**Files:** Create `supabase/migrations/20261004210400_c1_cost_workflow_cash_commands.sql`; modify workflow files, `server/features/costs/finance/project-finance-write.{repository,service,routes}.ts`, `server/features/costs/project-cost.service.ts`; tests `tests/unit/server/cost-workflow-cash.spec.ts`, `supabase/tests/database/c1/c1_cost_workflow_cash.test.sql`, `tests/unit/server/completed-projects.spec.ts`.

**Interfaces:** `confirmPayment(context,projectId,installmentId,{amount,currencyCode,paymentDate,reference,evidenceFileIds,expectedVersion},key)`; `createCashAdjustment(context,paymentId,CashAdjustmentInput,key)`; `decideCashAdjustment(context,adjustmentId,{submittedVersionId,decision,reason?},key)`; `confirmRefund(context,adjustmentId,{amount,receivedDate,evidenceFileIds,expectedVersion},key)`; `applyCashCorrection(context,adjustmentId,CommandVersion,key)`. Separate event types prevent fake inflow. Add API wrappers `installments/[installmentId]/payments.post.ts`, `payments/[paymentId]/adjustments.post.ts`, `adjustments/[adjustmentId]/decisions.post.ts`, `adjustments/[adjustmentId]/confirm-refund.post.ts`, `adjustments/[adjustmentId]/apply-correction.post.ts` under the workflow prefix.

- [ ] Fail cash assertions: approve30/pay10/refund2 => paid10/refund2/net8/remaining20; payment without proof or over20 rejected; repeat key returns same result, changed payload conflicts; double refund beyond actual outgoing denied.
- [ ] Fail Review Focus 2: correction reduces true cash below confirmed refunds => conflict; zero-out cash correction does not open capacity; no double subtraction/refund. Completed-project false approval timestamp, unrelated proof upload, increased cap/obligation and new payment target denied; correct prior-approved settlement permitted.
- [ ] Run `pnpm test:unit tests/unit/server/cost-workflow-cash.spec.ts tests/unit/server/completed-projects.spec.ts tests/unit/server/project-finance-write.service.spec.ts`; confirm targeted FAIL.
- [ ] Implement transaction project/assignment/contract/target/payment locks consistently with Task 4; consumption and cash write together. Subcontract uses its existing payment record as cash source. Refund/correction retain original and use immutable approved events; only actual received proof creates refund.
- [ ] Add server/RPC gates keyed by company workflow mode. Mode legacy preserves current behavior before cutover; `document_backed_v1` denies old direct ordinary publish, financial correction and subcontract record/void paths that would bypass a workflow decision. DB functions enforce gates even if API/UI are bypassed; new trusted private helpers require the verified decision/target, not a client flag. Source-only historic read/import provenance stays intact; no automatic source import posting into new cash.
- [ ] Pass unit tests and existing relevant writer regressions; queue real SQL/races for Task 9; commit. Checkpoint B3: no legacy/new write dual path after activation.

### Task 6: Cash reporting and historical reconciliation controls

**Files:** Modify `shared/schemas/costs/project-finance.ts`, `server/features/costs/finance/project-finance.{queries,repository,summary}.ts`, workflow queries; create `supabase/migrations/20261004210500_c1_cost_workflow_reconciliation.sql`, `scripts/c1-cost-workflow-inventory.mjs`, `scripts/c1-cost-workflow-reconcile.mjs`, `docs/runbooks/c1-document-backed-cost-cutover.md`; tests `tests/unit/server/cost-workflow-summary.spec.ts`, `tests/unit/server/project-finance.regressions.spec.ts`.

**Interfaces:** `readWorkflowCash(context,projectId): Promise<CashSummary>`; versioned finance response adds `workflowCash` rather than silently changing old DTO semantics before adoption. Read-only inventory emits counts/hashes and scoped mapping statuses, not credentials/file contents. Define `ReconcileLegacyCashInput {legacyKind:'ordinary_detail'|'subcontract_payment';legacyId:UUID;actualOutgoing:MoneyText;actualPaymentDate:string;evidenceFileIds:UUID[];reason:string;expectedLegacyHash:string}` and `reconcileLegacyCash(context,projectId,ReconcileLegacyCashInput,key):Promise<WorkflowCommandResult>`. It creates a mapping to verified cash only, not a fake manager approval; subcontract legacy cash maps to its original payment, ordinary cash requires newly verified proof. It cannot fabricate or automatically resolve missing historic evidence.

- [ ] Fail tests: published ordinary 100 is not paid100; source figure/invoice/upload/contract never adds cash; canonical subcontract cash counted once; retention held separate; partial coverage reports partial; unknown versus explicit0; all five categories use the same cash semantics.
- [ ] Run `pnpm test:unit tests/unit/server/cost-workflow-summary.spec.ts tests/unit/server/project-finance.regressions.spec.ts`.
- [ ] Implement cash projection with exact decimal helpers and legacy reconciliation mapping; immutable correction recalculates valid cash without restoring authorization. Preserve existing parent/detail aggregate checks and subcontract canonical exclusion.
- [ ] Write read-only inventory and guarded future reconciliation manifest path; expose preview/diff before executing. Inventory must preserve per-project parent/detail/published/draft/source/payment/evidence counts, sums and checksums, enumerate unreconciled, duplicates and missing cap mapping. Do not copy stale Sep30 mismatch counts or equate source amount to historic cash.
- [ ] Add `db:dev:c1:cost-workflow:inventory` (SELECT only) and `db:dev:c1:cost-workflow:reconcile` (explicit manifest/confirmation, scoped mutation) guarded scripts; test rejection of wrong target/unreviewed manifest. Reconciliation execution deferred to Task 10 authorization.
- [ ] Pass targeted tests; commit. Checkpoint C1: cash/reporting contract plus preview operational, no historical business data touched.

### Task 7: Structured extraction and material/subcontract/weekly crew basis

**Files:** Create extraction files listed above, `shared/schemas/costs/cost-extraction.ts`, `tests/fixtures/costs/extraction/materials.synthetic.xlsx` and synthetic PDF/text/image metadata fixtures; tests `tests/unit/server/cost-extraction.spec.ts`, `tests/unit/costs/cost-basis.spec.ts`.

**Interfaces:** `CostExtractionAdapter.extract(input:{fileId:UUID;mimeType:string;bytes:Uint8Array;scope:WorkflowScope}):Promise<ExtractionResult>`; result is `{status:'ready'|'needs_review'|'unavailable'|'failed'; fields; warnings; sourceLocations; methodVersion}`, never authoritative posting. `CostExtractionService.extract(context,requestId,fileId):Promise<ExtractionResult>` authorizes file/request and stores result separately. A fixture provider and Excel adapter satisfy the seam; text PDF adapter supports only verified available text tooling. Unavailable parser/OCR returns explicit state, no new dependency assumed.

- [ ] Fail tests for material lines/site delivery, subcontract acceptance/retention, crew week/worker-days/rate/allowance preserved; accountant-supplied VAT/rounding basis retained; uncertain totals/party match require review.
- [ ] Fail macro/external-link/zip oversize/invalid MIME/malformed date tests with bounded errors and no execution. Review Focus 3: request/file scope changing mid-extraction cannot attach old result. Fixture adapter makes no network call.
- [ ] Run `pnpm test:unit tests/unit/server/cost-extraction.spec.ts tests/unit/costs/cost-basis.spec.ts tests/unit/server/vqh-workbook-family-adapter.spec.ts`.
- [ ] Implement bounded Excel parsing using existing exceljs; do not turn existing family-specific controlled importer into a general posting pipeline. Retain worker/details in reviewed request basis; no auto-opening suppliers or auto-posting. No provider selection, real photo transfer or sample-attachment requirement.
- [ ] Pass tests, review generated fixture bytes/content for synthetic data only, commit. Checkpoint C2: scan-prefill contract usable even when real OCR is unavailable; external adapter remains a gated later integration.

### Task 8: Stable HTTP contract and AGY UI only

**Files:** Codex creates `app/repositories/http/http-cost-workflow-repository.ts`, modifies registry/plugin, tests `tests/unit/repositories/http-cost-workflow-repository.spec.ts`; handoff `docs/superpowers/specs/2026-10-04-cost-workflow-ui-handoff.md`. AGY creates `app/pages/costs/[projectId]/requests/index.vue`, `app/pages/costs/[projectId]/requests/[requestId].vue`, `app/pages/costs/[projectId]/requests/new.vue`; components `CostRequestReviewPanel.vue`, `CostInstallmentPaymentModal.vue`, `CostWorkflowAdjustmentPanel.vue`, `ProjectCostManagerAssignmentPanel.vue`, `app/components/app/CostNotificationBell.vue`.

**Modify only after complete-flow readiness:** `app/components/app/navigation-permissions.ts`, `app/pages/costs/[projectId]/index.vue`, existing ordinary/subcontract ledger components, source/draft/entries pages. Test `tests/e2e/cost-workflow.spec.ts`, update source/ordinary/accounting-write/navigation expectations for both modes.

**Interfaces:** HTTP repository mirrors Task 4/5 method names/types, including initial contract basis creation/read, captures active company on each request, accepts generated idempotency key and target version. Document exact URLs/result/errors from implemented contracts; all business writes through Taskovia APIs, only intent-scoped Storage upload directly.

- [ ] Codex writes failing HTTP tests for scoped URLs, captured company, no network with missing company, conflict mapping and receipt replay recovery; run `pnpm test:unit tests/unit/repositories/http-cost-workflow-repository.spec.ts`.
- [ ] Codex implements/passes typed repository and synthetic mock route fixtures, freezes handoff and records version. Do not hand AGY unfinished money/auth interfaces.
- [ ] AGY, only on verified Gemini 3.8 Flash High/high, implements upload→prefill→accountant review→submit→manager return/approve→payment/refund proof flows and director assignments/bell. Include missing manager, OCR unavailable, undelivered bell, partial coverage, completed settlement and file view/download. Prevent stale scope responses with existing request-generation helpers; do not implement backend policy in UI.
- [ ] AGY writes browser assertions for 30/70, paid10/refund2/net8, manager handover/no resubmit, supplier/crew and supporting-file required, old page deep-link behavior, inactive director and completed settlement. Run `pnpm test:e2e tests/e2e/cost-workflow.spec.ts --project=chromium` against isolated mocked fixtures; pass does not prove PostgreSQL/RLS.
- [ ] Codex reviews UI diff/contracts/accessibility and runs targeted repository/UI unit/browser checks. Use stable import paths; no HRfix/app-shell broad redesign. Remove source menu/Excel reconciliation columns and cost-draft UX only in activated mode when replacement readiness is verified; preserve provenance/evidence backend permission.
- [ ] Commit scoped UI/repository/test changes. Checkpoint D: full mocked user journey and legacy-mode regressions pass; no Cloud DEV real users modified.

### Task 9: Authorized Cloud DEV schema and transaction verification

**Files:** Extend new guarded runners/tests; create `docs/implementation/taskovia-c1/phase-reports/cost-workflow-dev-verification.md`. Generated file `shared/types/database.types.ts` has one integrator.

**Interfaces:** `db:dev:c1:cost-workflow:test` returns actual pgTAP assertion/exit evidence; concurrency runner records run UUID, fixture IDs, actors, barriers, results and remaining fixtures. No broad trigger disabling or deleting append-only audit/role assignment history.

- [ ] Before any DDL/test fixtures, present pending migration manifest and exact DEV operations for explicit authorization. Run available `pnpm db:dev:target`, `pnpm db:dev:status`, `pnpm db:dev:dry-run`; inspect plan, applied history and relation collisions. These do not authorize `push`.
- [ ] With separately authorized rollback rehearsal, exercise exact new migrations plus synthetic tests in one guarded transaction. Extend the existing runner rather than claiming the current `db:dev:c1:rehearse` runs these new migrations. Verify rollback and exit/result markers; no Local DB fallback.
- [ ] If schema application is explicitly authorized, use `pnpm db:dev:push` for reviewed forward-only set; then `pnpm db:dev:types` and inspect all generated diffs. No concurrent HRfix DB pushes.
- [ ] Run `pnpm db:dev:c1:cost-workflow:test` and authorized concurrency runner. Scenarios: approval vs reassignment, approval vs completion, two approvals over cap, two payments over remainder, refund vs correction, settlement vs completion, duplicate receipt, actor offboarding before replay. Also raw authenticated RPC, direct SQL/RLS and Storage policy unauthorized paths; no reliance on UI tests.
- [ ] Keep pgTAP fixtures rollback-only whenever possible. For cross-session committed fixtures, obtain explicit namespace/write/retention authorization first; generate unique synthetic identities, inventory them, deactivate/revoke through supported commands and report immutable audit/role history retained. If deletion is impossible without weakening guards, retain safely and report; do not disable triggers, impersonate service role or promise zero leftover rows. Any destructive cleanup needs its own reviewed scope and authorization.
- [ ] Pass required unit/type/lint/build checks on the exact integrated tree, serialize one ephemeral build, record SHA/commands/results/coverage and actual budget. Commit code/test/report/type diffs only. Checkpoint E1: true backend/RLS/concurrency evidence; no real onboarding/reconciliation performed yet.

### Task 10: Account onboarding, historical review and DEV activation rehearsal

**Files:** Create `scripts/c1-cost-workflow-activate.mjs`, `tests/unit/config/c1-cost-workflow-activation.spec.ts`; extend guarded `scripts/run-supabase-dev.mjs`/package script only for the reviewed activation operation. Modify reviewed supported configuration/runbook manifests; no broad HR implementation changes. Target accounts: manager `vqh-manage@taskovia.invalid` / `8274a3ea-7a2e-4584-b5a6-6bbad44c6f12`; director `vqh-director@taskovia.invalid` / `8e4e406d-d798-4262-bb30-b5e5213ec006`; Eo Gió project `7e7e3904-d53b-4337-9360-22256887474a`.

**Interfaces:** Reviewed manifest identifies minimal role/membership/assignment changes, exact affected rows and workflow mode. Accountant reconciliation preview separately lists every historic cash fact/evidence/map and exclusions; no default bulk approval.

- [ ] Refresh read-only current account/membership/role and HRfix contract evidence. Verify required supplier/subcontractor/crew identities exist and crew ownership is reviewed; missing master data goes through the existing authorized party-management path, not OCR auto-creation or a new broad accountant grant. Manager previously had no membership/employee/role; director had active VQH membership and only cost/project read. Do not assume the evidence remains current, create duplicate Auth accounts or invent an employee record requirement.
- [ ] Obtain explicit current-task authorization for exact onboarding/grants, using existing supported HR/RBAC paths after HRfix integration. Director gets only assign-manager/request/evidence/notification reads required by design; manager capability remains scoped by assignment to Eo Gió. No accountant/director/company_admin substitute and no password handling in transcripts.
- [ ] Run inventory SELECT preview, compare canonical historic parent/detail/source/payment/evidence counts/sums/hashes before/after additive schema. Accountant reviews evidence and approves exact reconciliation manifest; execute only separately authorized guarded reconcile operation. Unreconciled historic facts remain clearly excluded from new metrics; missing cap mappings block relevant new requests, never fabricated approvals.
- [ ] Write failing activation-runner tests for wrong DEV target, unreviewed company/manifest, stale expected mode, incomplete readiness evidence and missing explicit operation authorization; implement guarded preview/execute and pass `pnpm test:unit tests/unit/config/c1-cost-workflow-activation.spec.ts` before any activation. Mode setter `setWorkflowMode(context,companyId,{expectedMode:'legacy',mode:'document_backed_v1',readinessManifestHash:string},key)` and RPC `c1_activate_document_backed_cost_workflow` are defined in the Task 5 cash/gate migration and workflow repository. It uses an authenticated authorized `cost.config.manage` actor, server-verified readiness manifest and scoped audit, never a browser-supplied readiness flag.
- [ ] Rehearse activation on authorized synthetic company first: mode flip atomically closes all old bypasses while new commands work. For actual DEV VQH activation, present mode change, exact user/role coverage and historical coverage to user; no implicit authorization from plan approval.
- [ ] With activation authorization, execute approved guarded `db:dev:c1:cost-workflow:activate` added to package/runner in this task, then conduct accountant/manager/director acceptance without paying fictitious amounts into real projects. Separate approved test transactions from real business records; report persistent audit effects and legacy counts honestly.
- [ ] Record Eo Gió manager assignment, director access and rejected other-project operations; obtain product acceptance. If missing manager/coverage blocks some projects, show prerequisite and keep those projects blocked rather than falling back to old bypass. Checkpoint E2: authorized DEV configuration and acceptance, no Production change.

### Task 11: Final review and release packet

**Files:** Final cutover runbook, acceptance report and scoped PR description. Product changes remain those already tested; no new refactor.

- [ ] Review spec coverage and whole integrated diff: no source deletion, no public files, no financial double-counting, permission/UI/RPC parity, completed guards and HRfix untouched. Resolve supported findings and rerun only affected tests.
- [ ] Run `pnpm verify:app` once on final reviewed SHA after prerequisites, plus focused `pnpm test:e2e` suite for workflow/accounting/navigation/completed scope and authorized Cloud DEV checks already described. Full-suite expansion only when changed surface or failures justify it. If a check cannot run due budget/access/space, mark it blocked, not passed.
- [ ] Review generated types/files, check worktree diff has no credentials/build outputs/unrelated edits, create reviewable scoped PR only under execution authorization and attach it. No merge/push/deploy is performed by this planning request.
- [ ] Produce release packet with exact code SHA, migration ordering/status, required DEV/Production permissions, inventory/reconciliation coverage, account grants and actual checks. Application rollback cannot restore old direct writer bypass after new data exists; forward corrective migration or disable new submissions while retaining reads/allowed prior settlement, subject to reviewed target-specific action.
- [ ] Stop before Production cutover, destructive repairs, real grants/data changes not already authorized or external OCR integration. Each requires a concrete reviewed target/operation and permission. No premature deployment because mocked browser tests pass. Checkpoint F: reviewable release candidate and honest blockers.

## Coverage and review result

Spec sections 1–4 → Tasks 1, 3–5, 8; 5–6 → Tasks 2, 5, 7; 7 → Tasks 3, 7, 9; 8 → Tasks 2, 4, 10; 9 → Tasks 3, 5, 9; 10 → Tasks 4, 8; 11 → Tasks 2, 4, 5, 9; 12 → Tasks 6, 10; 13 → global constraints and Tasks 3–10; 14 → named unit/SQL/browser/race assertions; 15 → checkpoints/authorization; 16 → read-only baseline references above. Five Review Focus conditions have owning tests.

This is one coordinated plan because request/evidence/approval/cash/legacy gates share contracts and cannot safely cut over independently. Scan integration is an explicit separately gated adapter step; no general procurement, warehouse, full accounting ledger or HR redesign is added.

## User review and execution choice

Plan ready for user review; no implementation has begun. Recommend **Native/serial**: shared SQL/auth/money interfaces and the $4 budget favor one Codex integrator, targeted checks and one bounded AGY UI handoff. User may choose subagent-driven execution instead, with extra context/review cost and the same shared-file serial rules. Choosing a method does not authorize DB/grants/reconciliation/release operations. After plan review and method selection, start only the authorized code tasks; stop at each resource/DB/integration boundary described above.