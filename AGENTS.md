# Taskovia repository instructions

## Scope

- These instructions apply repository-wide unless a more specific nested `AGENTS.md` applies.
- System, runtime, and current user/task instructions take precedence.
- No AI role, tool, handoff sequence, approval ceremony, branch strategy, worktree strategy, pull-request process, or merge process is mandated at repository level.
- Read the relevant source, tests, contracts, and technical documentation before changing them.

## Change safety

- Keep changes within the current task. Do not overwrite, reset, stash, clean, delete, or otherwise disturb unrelated work.
- Preserve the established architecture and product contracts, including API/data contracts, authentication, authorization, permissions, RLS, and migration ordering, unless the current task explicitly changes them.
- Stop and report a blocker when requirements conflict or a requested change would cross a product, data, security, or production boundary not explicitly included in the current task.
- Do not print or commit secrets, credentials, tokens, or environment-specific secret values.
- Review generated files whenever a command updates them.

## Database and environment safety

- Supabase Cloud DEV is the only supported development database target.
- Taskovia Cloud DEV and Production are separate environments and separate authorization boundaries.
- If a task requires database access and Cloud DEV is unavailable or not authorized, the task must BLOCK rather than fall back to a Local DB.
- Cloud DEV mutations require explicit authorization in the current task and must use the guarded `db:dev:*` commands from `package.json`.
- Database migrations are forward-only. Do not edit a migration that has already been applied; add a new corrective migration instead.
- Do not perform a production deployment, production database mutation, destructive database operation, reset, seed, or migration repair without an explicit current request that identifies the target and operation.
- Stop and report a blocker before any operation that could destroy data or affect Production without clear authorization.

## Verification

- Run verification proportionate to the change before claiming completion.
- `package.json` is the source of truth for available commands. Common local checks are `pnpm test:unit`, `pnpm test:e2e`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `pnpm verify:app`.
- `pnpm db:dev:types` and `pnpm verify:dev` may update tracked generated database types; review the resulting diff.
- `pnpm db:dev:push` mutates Cloud DEV and requires explicit current-task authorization.
- Never report a test, lint, typecheck, build, deployment, or validation result as passing unless that exact check was actually run successfully on the reported tree.
