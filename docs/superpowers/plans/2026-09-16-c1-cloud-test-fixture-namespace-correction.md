# C1 Cloud Test Fixture Namespace Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the deterministic collision between persistent C1 acceptance prerequisites and rollback-only Cloud verification fixtures without weakening test isolation or changing Project Cost business behavior.

**Architecture:** Reserve c100 for persistent acceptance prerequisites, c101 for Project Cost, c110/c111 for foundation, c120 for controlled-import commands foreign fixtures, and c121 for controlled-import security foreign fixtures. Controlled-import tests consume and verify persistent c100 prerequisites while creating only transaction-local supplemental data.

**Tech Stack:** PostgreSQL, Supabase SQL migrations/tests, Node.js Cloud DEV verification runner, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-16-c1-cloud-test-fixture-namespace-design.md`

## Global Constraints

- `c100` is the persistent C1 acceptance prerequisite namespace; controlled-import supplemental data is transaction-local, but tests must not recreate its persistent tenant, companies `0020`/`0021`, or roles `0911`/`0912`.
- `c101` is owned only by the transaction-only Project Cost fixture; controlled-import tests must not use it.
- `c102/c103` remain the transaction-only audited source-ownership namespaces; `c110/c111` are the transaction-only foundation primary/foreign namespaces.
- `c120` is the transaction-only controlled-import commands foreign namespace; `c121` is the transaction-only controlled-import security foreign namespace.
- `c1_foundation.test.sql` remains self-contained, uses `c110/c111`, starts with `BEGIN`, ends with `ROLLBACK`, and contains no `COMMIT`.
- Controlled-import command and security tests consume and assert the persistent c100 contract, then create only transaction-local supplemental rows.
- Persistent role `c100...0911` has exactly `cost.source.read` and `cost.prepare`; persistent role `c100...0912` has exactly `cost.source.read` and never receives `cost.prepare`.
- Do not change `c1_project_cost_items.test.sql` without direct collision evidence; do not change the independent `c102/c103` audited-source fixture without a direct contract issue.
- Do not edit the applied prerequisite migration, delete Cloud fixture rows, use `ON CONFLICT DO NOTHING` to hide collisions, randomize UUIDs, reorder/skip runner files, or special-case runner failures.
- Preserve runner first-failure behavior, test order independence, deterministic repeatability, rollback isolation, and the prohibition on real VQH data.
- No generic fixture-builder framework: this is a fixed five-file SQL suite and uses direct SQL corrections.
- No Cloud command is part of the local implementation checkpoint. A rerun requires a new explicit authorization.

### Task 1: Add fixture-ownership regression contracts first

**Files:**
- Modify: `tests/unit/config/c1-cloud-dev-runner.spec.ts`
- Modify: `tests/unit/config/c1-acceptance-prerequisites-contract.spec.ts`
- Modify: `tests/unit/config/c1-controlled-import-persistence-contract.spec.ts`
- Inspect: `scripts/run-c1-cloud-dev-tests.mjs`

**Interfaces:**
- Consumes the fixed runner allowlist and `validateC1CloudDevSql`.
- Produces local static proof that namespace ownership and transaction guards hold before any SQL fixture is changed.

- [ ] **Step 1: Write failing static tests.**

```ts
expect(foundation).not.toContain("c1000000-0000-4000-8000-000000000010")
expect(foundation).toContain("c1100000-0000-4000-8000-000000000010")
expect(foundation).toContain("c1110000-0000-4000-8000-000000000010")
expect(commands).not.toMatch(/insert into public\.tenants[\s\S]*c1000000-0000-4000-8000-000000000010/iu)
expect(projectCost).toContain("c1010000-0000-4000-8000-000000000010")
expect(commands).toContain("c1200000-0000-4000-8000-000000000010")
expect(commands).not.toContain("c1010000-0000-4000-8000-000000000010")
expect(security).toContain("c1210000-0000-4000-8000-000000000010")
expect(security).not.toContain("c1010000-0000-4000-8000-000000000010")
expect(prerequisites).toContain("('c1000000-0000-4000-8000-000000000911'::uuid, 'cost.source.read')")
expect(prerequisites).toContain("('c1000000-0000-4000-8000-000000000911'::uuid, 'cost.prepare')")
expect(prerequisites).toContain("('c1000000-0000-4000-8000-000000000912'::uuid, 'cost.source.read')")
expect(prerequisites).not.toContain("('c1000000-0000-4000-8000-000000000912'::uuid, 'cost.prepare')")
```

- [ ] **Step 2: Run the contracts RED.**

Run: `pnpm exec vitest run tests/unit/config/c1-cloud-dev-runner.spec.ts tests/unit/config/c1-acceptance-prerequisites-contract.spec.ts tests/unit/config/c1-controlled-import-persistence-contract.spec.ts`

Expected: FAIL because foundation still owns `c100/c101`, controlled-import fixtures still insert persistent c100 identities, and controlled-import foreign fixtures still claim c101.

- [ ] **Step 3: Extend runner static checks.** Assert each of the five allowlisted SQL files starts with `BEGIN`, ends with `ROLLBACK`, contains no `COMMIT`, and the allowlist remains foundation → commands → security → audited ownership → Project Cost.

- [ ] **Step 4: Re-run the same command.**

Expected: still RED until Tasks 2–4 change fixture ownership; the rollback and persistent-prerequisite assertions must fail for the intended reasons only.

### Task 2: Re-home the foundation fixture

**Files:**
- Modify: `supabase/tests/database/c1/c1_foundation.test.sql`
- Test: `tests/unit/config/c1-cloud-dev-runner.spec.ts`

**Interfaces:**
- Replaces the foundation's primary `c100` identities with `c110` identities and its foreign `c101` identities with `c111` identities.
- Leaves Project Cost's `c101` namespace untouched.

- [ ] **Step 1: Keep the regression test failing before SQL edits.** Confirm its failure names persistent `c100...0010` in foundation.

- [ ] **Step 2: Move declarations, then every dependent reference as one reviewed graph.**

```sql
-- Foundation-owned primary identities
a_tenant  := 'c1100000-0000-4000-8000-000000000010';
a1_company := 'c1100000-0000-4000-8000-000000000020';
a2_company := 'c1100000-0000-4000-8000-000000000021';

-- Foundation-owned foreign identities
b_tenant  := 'c1110000-0000-4000-8000-000000000010';
b1_company := 'c1110000-0000-4000-8000-000000000020';
```

Update every foundation-owned user, role, project, party, engagement, component, request, and idempotency UUID reference to the matching primary (`c110`) or foreign (`c111`) fixture. Trace each foreign key and assertion; do not do an unreviewed global string replacement. Preserve existing tenant/company isolation, permissions, module enablement, anonymous/authenticated boundaries, and all behavior assertions.

- [ ] **Step 3: Run focused RED/GREEN static verification.**

Run: `pnpm exec vitest run tests/unit/config/c1-cloud-dev-runner.spec.ts`

Expected RED before the SQL correction; PASS after every foundation reference is coherent and the runner accepts the rollback-only fixture.

### Task 3: Correct the controlled-import commands fixture

**Files:**
- Modify: `supabase/tests/database/c1/c1_controlled_import_commands.test.sql`
- Modify: `tests/unit/config/c1-controlled-import-persistence-contract.spec.ts`
- Test: `tests/unit/config/c1-acceptance-prerequisites-contract.spec.ts`

**Interfaces:**
- Consumes persistent tenant `c100...0010`, companies `c100...0020`/`0021`, and roles `c100...0911`/`0912`.
- Produces transaction-local supplemental primary data plus c120 foreign tenant/company data; it does not use c101.

- [ ] **Step 1: Write the failing command-fixture ownership tests.** Assert the file verifies the persistent tenant/company/role contract before use; assert it does not insert persistent c100 tenant/company/role rows; assert persistent `0911` is used for importer operations; assert `v_tenant_b`/`v_company_b1` use c120; assert c101 foreign tenant `...0010` is absent; and assert any A2 capability role uses a new transaction-local reserved ID.

- [ ] **Step 2: Run RED.**

Run: `pnpm exec vitest run tests/unit/config/c1-controlled-import-persistence-contract.spec.ts tests/unit/config/c1-acceptance-prerequisites-contract.spec.ts`

Expected: FAIL because the fixture recreates tenant/company/role identities.

- [ ] **Step 3: Replace persistent-row inserts with prerequisite assertions and re-home foreign data.** Verify tenant code/name/deployment mode, A1/A2 company identity, role `0911` permissions (`cost.source.read`, `cost.prepare`), and role `0912` permission (`cost.source.read`) at the beginning of the transaction. Set `v_tenant_b` to `c1200000-0000-4000-8000-000000000010` and `v_company_b1` to `c1200000-0000-4000-8000-000000000020`; move every dependent B-side project, controlled-import run, accounting source, source version, request/idempotency identifier, and foreign-only evidence row coherently into c120. Keep primary supplemental rows transaction-local. Introduce a new local A2 role only if the fixture needs a capability not supplied by the persistent roles.

- [ ] **Step 4: Preserve canonicalization evidence deliberately.** The frozen manifest and canonical-vector tests in `c1-controlled-import-persistence-contract.spec.ts` use exact hashes. Recompute no hash by guesswork: run that exact static test after changing literal UUIDs, read its expected-vs-actual failure if it occurs, and update an expected digest only when the canonical manifest payload intentionally changed and the new digest is produced by `canonicalizeManifest`.

- [ ] **Step 5: Run GREEN.**

Run: `pnpm exec vitest run tests/unit/config/c1-controlled-import-persistence-contract.spec.ts tests/unit/config/c1-acceptance-prerequisites-contract.spec.ts tests/unit/config/c1-cloud-dev-runner.spec.ts`

Expected: PASS; the fixture consumes persistent prerequisites, preserves frozen canonical behavior, and remains rollback-safe.

### Task 4: Correct the controlled-import security fixture

**Files:**
- Modify: `supabase/tests/database/c1/c1_controlled_import_security.test.sql`
- Modify: `tests/unit/config/c1-controlled-import-persistence-contract.spec.ts`
- Test: `tests/unit/config/c1-acceptance-prerequisites-contract.spec.ts`

**Interfaces:**
- Consumes the same persistent c100 acceptance baseline.
- Produces c121 foreign tenant/company data and preserves source-only, importer, project-only, and disabled-company denial behavior without changing persistent role capabilities.

- [ ] **Step 1: Write failing security-fixture ownership tests.** Assert no insert recreates persistent c100 tenant, A1/A2 company, role `0911`, or role `0912`; assert the fixture verifies prerequisite identity and exact role permissions; assert it never grants `cost.prepare` to `0912`; assert `v_tenant_b`/`v_company_b1` use c121; and assert c101 foreign tenant `...0010` is absent.

- [ ] **Step 2: Run RED.**

Run: `pnpm exec vitest run tests/unit/config/c1-controlled-import-persistence-contract.spec.ts tests/unit/config/c1-acceptance-prerequisites-contract.spec.ts`

Expected: FAIL because the security fixture recreates the persistent identities.

- [ ] **Step 3: Consume prerequisites, re-home foreign data, and add local roles only when required.** Remove only persistent c100 tenant/company/role inserts. Set `v_tenant_b` to `c1210000-0000-4000-8000-000000000010` and `v_company_b1` to `c1210000-0000-4000-8000-000000000020`; move every dependent B-side foreign identity into c121. Retain transaction-local users, memberships, role assignments, sources, manifests, and denial data. A non-persistent role must use a new reserved synthetic ID and receive only the capability that its assertion needs.

- [ ] **Step 4: Run GREEN.**

Run: `pnpm exec vitest run tests/unit/config/c1-controlled-import-persistence-contract.spec.ts tests/unit/config/c1-acceptance-prerequisites-contract.spec.ts tests/unit/config/c1-cloud-dev-runner.spec.ts`

Expected: PASS; `0912` remains source-only and all rollback/runner guards remain intact.

### Task 5: Verify unaffected fixture namespaces

**Files:**
- Inspect only: `supabase/tests/database/c1/c1_project_cost_items.test.sql`
- Inspect only: `supabase/tests/database/c1/c1_audited_source_ownership_correction.test.sql`
- Test: `tests/unit/config/c1-cloud-dev-runner.spec.ts`

- [ ] **Step 1: Add or retain static assertions for the independent namespaces.**

```ts
expect(projectCost).toContain('c1010000-0000-4000-8000-000000000010')
expect(commands).toContain('c1200000-0000-4000-8000-000000000010')
expect(commands).not.toContain('c1010000-0000-4000-8000-000000000010')
expect(security).toContain('c1210000-0000-4000-8000-000000000010')
expect(security).not.toContain('c1010000-0000-4000-8000-000000000010')
expect(auditedOwnership).toContain('c1020000-0000-4000-8000-000000000010')
expect(auditedOwnership).toContain('c1030000-0000-4000-8000-000000000010')
```

- [ ] **Step 2: Run:** `pnpm exec vitest run tests/unit/config/c1-cloud-dev-runner.spec.ts`.

Expected: PASS. Do not edit either SQL fixture unless this inspection proves a direct collision.

### Task 6: Full local verification and commit

**Files:**
- Modify only the regression tests and the three SQL fixtures proven necessary by Tasks 1–4.

- [ ] **Step 1: Run focused local verification.**

Run: `pnpm exec vitest run tests/unit/config/c1-cloud-dev-runner.spec.ts tests/unit/config/c1-acceptance-prerequisites-contract.spec.ts tests/unit/config/c1-controlled-import-persistence-contract.spec.ts`

Expected: PASS.

- [ ] **Step 2: Run repository-wide local gates.**

Run: `pnpm typecheck`

Run: `pnpm lint`

Run: `git diff --check`

Expected: every command exits 0.

- [ ] **Step 3: Review scope and commit only after all checks pass.**

```bash
git add supabase/tests/database/c1/c1_foundation.test.sql supabase/tests/database/c1/c1_controlled_import_commands.test.sql supabase/tests/database/c1/c1_controlled_import_security.test.sql tests/unit/config/c1-cloud-dev-runner.spec.ts tests/unit/config/c1-acceptance-prerequisites-contract.spec.ts tests/unit/config/c1-controlled-import-persistence-contract.spec.ts
git commit -m "fix(c1): isolate cloud test fixture namespaces"
```

Do not include `c1_project_cost_items.test.sql`, `c1_audited_source_ownership_correction.test.sql`, the applied migration, or the runner unless direct evidence changes the scope.

### Task 7: Treat Cloud rerun as a separate gate

**Files:** None.

- [ ] **Step 1: Stop after the committed local correction and remote review.**

`pnpm db:dev:c1:test` is NOT run during local correction implementation.

- [ ] **Step 2: Obtain new explicit authorization before any Cloud rerun.** The authorization must follow code commit, remote review, and local-verification review. It must not be bundled into the implementation task.

## Plan self-review

- The spec and plan reserve c100 for persistent prerequisites and controlled-import supplements, c101 for Project Cost, c102/c103 for audited ownership, c110/c111 for foundation, c120 for commands foreign data, and c121 for security foreign data.
- Role `0911` retains `cost.source.read` and `cost.prepare`; role `0912` remains source-only.
- No task edits the applied migration, performs Cloud cleanup, suppresses conflicts, reorders the runner, or changes Project Cost without direct evidence.
- Every SQL correction has a named red/green static command, and Cloud execution remains separately authorized.
