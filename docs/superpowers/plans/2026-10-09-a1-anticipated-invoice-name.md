# A1 Anticipated Invoice Name Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional engineer invoice-name suggestion and a separate Buyer override on each proposal line, with canonical fallback and no change to actual invoice authority.

**Architecture:** Store the engineer value on a mutable proposal line and its immutable submitted revision. Store Buyer override in a versioned row keyed to revision and line. Canonical reads resolve Buyer -> engineer -> frozen canonical name; a dedicated Buyer command changes only the override.

**Tech Stack:** PostgreSQL/Supabase Cloud DEV, PL/pgSQL, Zod, Nuxt/H3, Vue 3, Vitest, pgTAP, Playwright.

**Spec:** docs/superpowers/specs/2026-10-09-a1-invoice-display-name-and-quantity.md

## Global Constraints

- Base is live A1 SHA 6fe710abd62bba9a971dd61cf12413716164cfc6 plus approved spec d4d0f364319faa8aab45106b2a283bc10b8e3ec9. Record each integration SHA.
- Applied migrations are immutable. Add later forward-only migrations and freeze their generated timestamp filenames before source work.
- Cloud DEV gtgljlnhwvhqdnwrfdfj is the sole development DB; source/tests/build stay on the approved remote worker. No Cloud command before a separate exact packet.
- Codex owns DB/API/contracts/review; AGY owns Vue/E2E. Codex does not implement UI or ask AGY to redo T5.
- Buyer retains no general proposal PATCH. Use existing material.order.manage for the dedicated override command. Keep positive numeric(20,4) quantities and actual accountant invoiceNames separate.
- No new dependency; preserve tenant/company/project scope, receipt/idempotency, expected versions, audit and historical snapshots.

## Review Focus

- Null/blank/whitespace engineer input resolves to canonical without falsely recording an override (Tasks 1-2).
- Catalog rename after submit does not change the submitted fallback (Task 2).
- Stale Buyer version, changed payload under same key and concurrent order creation do not silently win (Task 3).
- Return/resubmit resets current Buyer override while retaining old revision and audit (Task 3).
- Cross-company, peer-engineer and unprivileged Buyer writes are denied; predicted names never become actual invoice evidence (Tasks 3-5).

---

### Task 1: Shared contract and client method

**Owner:** Codex. **Files:** shared/schemas/costs/material-procurement.ts; app/repositories/material-procurement.contracts.ts; app/repositories/http/http-material-procurement-repository.ts; tests/unit/shared/material-procurement.spec.ts; tests/unit/repositories/http-material-procurement-repository.spec.ts.

**Interfaces:** Proposal line input gains proposedInvoiceName?: string | null (trim, max 200; blank means absent). Proposal line view gains engineerProposedInvoiceName: string | null, buyerProposedInvoiceName: string | null, effectiveInvoiceDisplayName: string, invoiceDisplayNameSource: 'buyer' | 'engineer' | 'canonical', buyerOverrideVersion: number. Buyer input is {revisionId: UUID, proposedInvoiceName: string | null, expectedOverrideVersion: number}. Client method setBuyerInvoiceName(projectId, proposalId, lineId, input, commandMetadata): Promise<MaterialCommandResult> uses PATCH .../proposals/:proposalId/lines/:lineId/invoice-name.

- [ ] Write RED tests for blank/null/201-character input, strict view fields and dedicated HTTP PATCH with idempotency key.
- [ ] Run pnpm exec vitest run tests/unit/shared/material-procurement.spec.ts tests/unit/repositories/http-material-procurement-repository.spec.ts; record intended RED.
- [ ] Implement only these DTO/client changes; do not widen general proposal PATCH or supplier/actual-invoice schemas.
- [ ] Rerun focused tests, typecheck and diff check; commit scoped files and give AGY the immutable contract SHA.

### Task 2: Engineer persistence and frozen fallback

**Owner:** Codex. **Files:** new CLI-generated migration c1_material_engineer_invoice_name after the integrated migration head; new supabase/tests/database/c1/c1_material_engineer_invoice_name.test.sql using only reserved c123 synthetic UUIDs; focused migration source guard if needed.

**Interfaces:** Add nullable engineer_proposed_invoice_name (trimmed, nonblank when present, max 200) to material_proposal_lines and material_proposal_revision_lines. Existing create/update/submit/read RPC signatures remain; accept proposedInvoiceName in JSON, copy it on submit, and compute draft fallback from current material_items.name versus submitted fallback from frozen revision.material_name. Buyer view is null/version 0 until Task 3.

- [ ] Write rollback pgTAP RED for blank fallback, explicit name, snapshot after catalog rename, returned resubmission, length and author denial; require plan(10) and finish(true).
- [ ] Run source-only RED/static guard; do not use Local DB or Cloud DEV yet.
- [ ] Add one forward-only migration, preserving receipt hashing, replay, scope checks and immutable history; fail closed on function-definition drift.
- [ ] Run focused schema/server/source tests, typecheck and diff check; commit migration and pgTAP source with exact filename.

### Task 3: Buyer override, version, audit and order lock

**Owner:** Codex. **Files:** a second later CLI-generated migration c1_material_buyer_invoice_name_override; new supabase/tests/database/c1/c1_material_buyer_invoice_name_override.test.sql using only reserved c124 synthetic UUIDs; scripts/run-c1-cloud-dev-tests.mjs and tests/unit/material-cloud-runner.spec.ts to allowlist the two new rollback SQL files.

**Interfaces:** New material_proposal_invoice_name_overrides row is keyed by (revision_id, proposal_line_id), scoped to tenant/company/project/proposal, with nullable name, nonnegative version and actor/timestamps. Absent row is version 0; every set/clear increments and audits. No direct client DML. New public RPC c1_material_set_proposal_invoice_name(companyId, projectId, proposalId, lineId, input JSON, idempotencyKey, requestId) returns MaterialCommandResult. Require material.order.manage, current submitted/approved revision, expectedOverrideVersion and exact-key receipt. Lock the proposal line shared with order allocation before checking no non-cancelled order uses that revision line. Do not bump proposal.version or modify engineer snapshot/order. GET resolves Buyer > engineer > frozen canonical.

- [ ] Write rollback pgTAP RED for set/clear/priority, replay, stale/conflicting keys, cross-scope/peer denial, order race and resubmission history; require plan(12) and finish(true).
- [ ] Add only the needed table, security policy/grants, RPC, audit and read projection in the later migration.
- [ ] Add exact new pgTAP files to guarded A1 allowlist; test unknown-file, reserved c123/c124 UUID prefixes, rollback and no-Docker guards.
- [ ] Run focused DB guard/unit tests, typecheck and diff check; commit scoped files. No Cloud execution.

### Task 4: Dedicated Buyer API wiring

**Owner:** Codex. **Files:** server/features/costs/material-procurement/repository.ts, service.ts, routes.ts; new server/api/companies/[companyId]/projects/[projectId]/material-procurement/proposals/[proposalId]/lines/[lineId]/invoice-name.patch.ts; tests/unit/server/material-proposals.spec.ts and material-procurement.routes.spec.ts.

**Interfaces:** Service method setBuyerInvoiceName(context, projectId, proposalId, lineId, input, key) validates Task 1 schema and calls Task 3 RPC. Route gets UUIDs from path, actor/company from authenticated context and idempotency-key header, never from body.

- [ ] Write RED route/service tests for exact RPC arguments, malformed ID/body/key, scope/permission propagation and continued denial of Buyer updateProposal.
- [ ] Run focused RED, implement minimal H3/repository/service wiring, then run GREEN.
- [ ] Run focused Vitest, typecheck, lint and diff check; commit scoped backend and publish API SHA for AGY.

### Task 5: Engineer and Buyer UI

**Owner:** AGY only, after Tasks 1-4 and the separate quantity plan on the same Vue files. **Files:** app/components/materials/MaterialProposalForm.vue; app/pages/materials/[projectId]/proposals/[proposalId].vue; optional small Buyer panel only if it reduces page complexity; tests/e2e/material-proposal.spec.ts.

**Interfaces:** Engineer optional field appears on owned draft/returned lines. Buyer sees a separate override control on submitted/approved detail before the line enters an order. UI uses dedicated command and canonical GET, never Buyer general proposal PATCH.

- [ ] Write mocked browser RED for engineer fallback/explicit name, Buyer set/clear/priority, order lock, resubmission reset and no actual-invoice confusion; retain quantity/no-op/409 regressions.
- [ ] Run focused RED through approved remote native-layer Playwright config; record config, base SHA and failure.
- [ ] Implement scoped AGY Vue/E2E changes, preserving request tracker, idempotency, accessibility and role controls.
- [ ] Run focused E2E, typecheck, lint and build; commit UI/E2E files and give Codex immutable SHA/log for review.

### Task 6: Integrate and gate environments

**Owner:** Codex. **Files:** reviewed source integration and packet/evidence artifacts; generated types only after an approved Cloud run.

- [ ] Review AGY's exact diff and integrate accepted backend/UI commits on an isolated branch, leaving live A1 and unrelated work intact.
- [ ] Run focused unit, mocked Playwright, typecheck, lint and build on one SHA; compare any full-unit failures with the recorded baseline.
- [ ] Freeze a Cloud DEV packet naming exact new migrations, target/auth/status/dry-run/push, both rollback pgTAP files, typegen and a read-only check of the existing isolated fixture (no persistent fixture mutation unless separately justified). Execute only after explicit approval; stop on first failure.
- [ ] Freeze a separate GitHub/feature-preview packet after Cloud pass; deploy exact SHA only after approval. AGY runs signed-in live engineer/Buyer acceptance. No PR/merge/Production action in this plan.
