# Director assignment read routing

Root cause: the preparation page permits manager-assignment readers but loads projects via Project Register, which requires project.register.manage. A director with the existing assignment/read package therefore sees a denied load and no choices.

Bounded fix under the current end-to-end bugfix authorization:

1. Replace only the settings project's read source with the existing actor-scoped cost-workflow directory. Its existing RPC returns authorized project metadata during legacy preparation; no new endpoint, permission, role, RLS policy or SQL is needed.
2. Use directory projectId/code/name/state fields and keep only active project choices. Read up to ten bounded pages of 100 and fail closed on incomplete/duplicate/cyclic results. Stop before further reads when the captured company/account/session scope changes.
3. Preserve conditional configuration/crew reads, the existing project-context canAssign authority, manager assignment panel, optimistic versions, frozen idempotency command and uncertain-write blocking.
4. Verify the original administrator-only call regression fails before replacement, then verify legacy/director directory routing, pagination, scope changes and denied-read handling with focused local unit contracts. Run scoped lint, strict helper/test TypeScript, Vue compile and exact diff checks; obtain independent source review.
5. Freeze the exact patch against DEV 7fbea88f1ed6f0cbc3372405b021dbe467edcda7. Publication and the additional source-only preview rollout remain HOLD until the parent obtains the required scoped release approval.

File scope: app/pages/settings/cost-workflow.vue; app/utils/costs/manager-assignment-projects.ts; tests/unit/costs/manager-assignment-projects.spec.ts; this plan.

Real verification after an approved rollout: preserve the genuine fixed-director session, reload /settings/cost-workflow, verify EO-GIO appears, select it and verify the server-authorized eligible manager panel. Do not submit assignment, activate the company or call Azure as part of this source check.

Local runtime remains Node22 with reused dependencies; no full Nuxt build or full-suite pass is claimed. No additional mock application/DB/provider stage is introduced.
