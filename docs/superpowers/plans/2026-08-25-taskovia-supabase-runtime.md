# Taskovia Supabase Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an isolated Taskovia Control/Auth Supabase environment contract while retaining the VQH data-plane configuration and Cloud DEV target.

**Architecture:** Nuxt runtime config receives namespaced Taskovia public and private values alongside the existing VQH values. The tracked environment template and operations runbook document the separation, while the ignored local environment is extended without replacing existing credentials.

**Tech Stack:** Nuxt 4 runtime config, TypeScript, Vitest, Supabase Cloud, Vercel environment variables

**Spec:** `docs/superpowers/specs/2026-08-25-taskovia-supabase-runtime.md`

## Global Constraints

- Keep the current VQH variables and canonical Cloud DEV project target unchanged.
- Never expose either service-role key through `runtimeConfig.public` or a `NUXT_PUBLIC_*` variable.
- Never commit actual URLs, tokens, or keys.
- Preserve existing ignored `.env.local` values.

---

### Task 1: Taskovia runtime environment contract

**Files:**
- Modify: `tests/unit/config/supabase-environment.spec.ts`
- Modify: `.env.example`
- Modify: `nuxt.config.ts`
- Modify: `.env.local` (ignored; append empty variables only when absent)
- Modify: `docs/runbooks/employee-onboarding-and-rbac.md`

**Interfaces:**
- Consumes: Nuxt environment-variable mapping for `runtimeConfig` and `runtimeConfig.public`.
- Produces: `taskoviaSupabaseServiceRoleKey`, `public.taskoviaSupabaseUrl`, and `public.taskoviaSupabaseAnonKey` runtime fields.

- [x] **Step 1: Write the failing configuration test**

Add assertions that the tracked template declares all three empty Taskovia variables, the Nuxt config declares the corresponding private/public fields, and the existing VQH variables remain present.

- [x] **Step 2: Run the focused test to verify RED**

Run: `pnpm test:unit tests/unit/config/supabase-environment.spec.ts`

Expected: FAIL because the Taskovia variables and runtime fields do not exist yet.

- [x] **Step 3: Implement the minimal runtime and environment configuration**

Add the three Taskovia entries to `.env.example` and their empty runtime defaults to `nuxt.config.ts`. Append the same empty variable names to ignored `.env.local` only if absent; do not replace any existing line or value.

- [x] **Step 4: Document local and Vercel scopes**

Update the employee/RBAC runbook to distinguish the Taskovia Control/Auth variables from VQH data-plane variables and state that PAT/JWT signing keys are not application runtime variables.

- [x] **Step 5: Run the focused test to verify GREEN**

Run: `pnpm test:unit tests/unit/config/supabase-environment.spec.ts`

Expected: PASS with no failed assertions.

- [x] **Step 6: Run the application verification gate**

Run: `pnpm verify:app`

Expected: unit tests, typecheck, lint, and production build all exit successfully.
