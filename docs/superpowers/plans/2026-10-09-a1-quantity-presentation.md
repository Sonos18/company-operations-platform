# A1 Quantity Presentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show material proposal quantities without trailing fractional zeros while preserving exact positive decimal data and save/replay behavior.

**Architecture:** Format decimal strings only at the UI boundary. Hydrate editable fields with the same display normalization and compare semantic quantity values in no-op signatures; leave API payload validation, numeric(20,4) storage, and positive constraints unchanged.

**Tech Stack:** Nuxt/Vue 3, TypeScript, Vitest, Playwright.

**Spec:** docs/superpowers/specs/2026-10-09-a1-invoice-display-name-and-quantity.md

## Global Constraints

- Start from reviewed live A1 source SHA 6fe710abd62bba9a971dd61cf12413716164cfc6 or the subsequently reviewed integrated backend head; record the exact base.
- AGY owns all Vue/E2E implementation. Codex supplies this plan, reviews AGY's immutable diff, and integrates only accepted work.
- No Cloud DEV mutation, migration, new dependency, Production action, or merge in this plan.
- Canonical quantities remain positive decimal strings with up to four fractional digits; UI formatting must never use JavaScript Number arithmetic.
- Preserve the T5 no-op save, exact-key 409 retry, stale-response guard, and signed-quantity floor.

## Review Focus

- A canonical 20.0000 must display as 20 without changing the GET value or persisted numeric amount (Task 2 E2E).
- A canonical 25.5000 must display as 25.5; 0.0000 progress must display as 0 (Tasks 1 and 2).
- Partial typed input such as 1. must not be rewritten mid-keystroke (Task 2 E2E).
- Hydrating 20.0000 into an unchanged form must not trigger PATCH on Save (Task 2 E2E).
- Zero, negative, blank, and below-signed-floor input must remain blocked; 409 retry must retain the exact command payload (Task 2 E2E).

---

### Task 1: Exact decimal-string display helper

**Owner:** AGY.

**Files:**
- Create: app/utils/materials/quantity-display.ts
- Test: tests/unit/utils/material-quantity-display.spec.ts

**Interfaces:**
- Produces: formatMaterialQuantity(value: string): string. Input is a validated decimal string from the material DTO; output strips only trailing fractional zeros and a final dot. Integer digits remain untouched.
- The same function is used for canonical read values and draft-signature comparison. It is not a money calculator or input sanitizer.

- [ ] **Step 1: Write the failing test.** Assert 20.0000 -> 20, 25.5000 -> 25.5, 0.0000 -> 0, 1000 -> 1000, and 0.1250 -> 0.125. Keep invalid input validation in the existing schema, not in this formatter.
- [ ] **Step 2: Run RED.** Run pnpm exec vitest run tests/unit/utils/material-quantity-display.spec.ts. Expected failure: missing helper.
- [ ] **Step 3: Implement the helper.** Use a string-only trim of the fractional suffix. Do not parse through Number or add a dependency.
- [ ] **Step 4: Run GREEN and commit.** Rerun the focused Vitest command, run git diff --check, and commit only the helper/test files.

### Task 2: Proposal form and detail display

**Owner:** AGY; depends on Task 1.

**Files:**
- Modify: app/components/materials/MaterialProposalForm.vue
- Modify: app/pages/materials/[projectId]/proposals/[proposalId].vue
- Test: tests/e2e/material-proposal.spec.ts

**Interfaces:**
- Consumes: formatMaterialQuantity(value: string): string.
- Produces no changed API/DB contract. The form may submit a valid decimal string such as 25.5; canonical GET may return 25.5000.

- [ ] **Step 1: Write failing browser checks.** Mock canonical GET with requested 20.0000, allocated/signed 0.0000, remaining 20.0000 and one 25.5000 line. Assert read-only engineer/Buyer DOM shows 20, 0, and 25.5. Reopening editable draft shows 20; unchanged Save sends zero PATCH calls.
- [ ] **Step 2: Run RED.** Run the focused material-proposal Playwright spec through the approved remote native-layer test configuration; record its exact config path and failing case.
- [ ] **Step 3: Implement minimal UI changes.** Format read-only quantities, progress, signed minimum and validation messages. Normalize hydrated input and both sides of the no-op signature with Task 1 helper. Do not rewrite text on each input event; preserve required/positive/signed-floor validation.
- [ ] **Step 4: Verify behavior.** Run the focused Playwright spec, including zero/negative/blank, no-op Save, stale-version 409 and exact-key retry. Run pnpm typecheck and pnpm lint on the remote source, then git diff --check.
- [ ] **Step 5: Commit scoped UI/E2E files.** Give Codex immutable head SHA and test log for read-only review; no preview deploy under this task.

## Integration gate

Codex reviews AGY's exact diff and confirms no quantity or other business authority changed. Quantity display can be integrated before invoice-name UI work, but the two AGY edits to the same Vue files must be serialized. Mocked browser pass does not claim live Cloud/UI acceptance.
