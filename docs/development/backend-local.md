# Cloud DEV backend development

## Prerequisites

- Node.js 24.x
- pnpm 10.29.3
- Access to the existing canonical Taskovia Cloud DEV project
- A dedicated Supabase DEV personal access token (PAT)

Docker is not required for the daily workflow. The local application and its database commands use the linked Supabase Cloud DEV project.

Taskovia owns the one canonical Supabase Cloud DEV database. VQH is its first tenant/company; there is no separate VQH database.

## Prepare `.env.local`

```powershell
Copy-Item .env.example .env.local
```

Fill only `NUXT_PUBLIC_SUPABASE_URL` and `NUXT_PUBLIC_SUPABASE_ANON_KEY` with the Cloud DEV URL and public/anon key. Never add a database password, access token, or service-role key to `.env.local`. Do not commit this file.

## Prepare the dedicated CLI PAT

```powershell
Copy-Item .supabase.dev.env.example .supabase.dev.env.local
```

Set the single `SUPABASE_DEV_ACCESS_TOKEN=` assignment in `.supabase.dev.env.local` to a DEV-project PAT. This ignored file is the authoritative CLI credential source for this worktree; never put a token in `.env.local`, source control, command history, or chat.

## One-time DEV link

Run this once from the repository root after obtaining access and preparing local credentials for the existing canonical Taskovia Cloud DEV project. Do not create or choose another Supabase project.

```powershell
pnpm db:dev:auth-check
pnpm db:dev:link
pnpm db:dev:status
```

`db:dev:auth-check` silently verifies that the PAT can see only the canonical DEV project ref needed by this workflow; it does not print the project list. The runner strips ambient Supabase access-token and database-password variables, then supplies only the PAT from `.supabase.dev.env.local`. `SUPABASE_HOME` remains isolated at `%LOCALAPPDATA%\SupabaseCLI\taskovia-dev` on Windows, with an XDG/HOME state-directory fallback elsewhere, for non-auth CLI state only. The PAT is authoritative; do not use `db:dev:login`, `--profile`, or the machine-global CLI session. The CLI link metadata under `supabase/.temp/` is ignored.

Every `db:dev:*` linked command starts with the canonical DEV target guard. It fails closed unless the tracked DEV ref `gtgljlnhwvhqdnwrfdfj`, ignored `supabase/.temp/project-ref`, and the project ref in `NUXT_PUBLIC_SUPABASE_URL` agree; it does not print the URL or key.

## Daily database workflow

```powershell
pnpm exec supabase migration new descriptive_name
pnpm db:dev:status
pnpm db:dev:dry-run
pnpm db:dev:push
pnpm db:dev:types
pnpm db:dev:advisors:security
pnpm db:dev:advisors:performance
pnpm verify:app
```

Never edit `shared/types/database.types.ts` manually. `pnpm dev` reads `.env.local`; deployment builds receive their public Supabase values from the deploy environment.

## Read-only VQH RLS smoke check

After the DEV administrator has been onboarded, run `pnpm db:dev:canonical-check` followed by `pnpm db:dev:rls-smoke`. Both are no-Docker fixed runner modes, run only after the canonical target guard passes, perform transaction/rollback assertions, and output no identity data.

## Optional Docker-backed pgTAP check

`pnpm db:dev:test` runs the Supabase CLI pgTAP runner and requires a Docker/container-capable environment, even when it targets the linked Cloud DEV project. It is optional and must not be added to the daily no-Docker workflow or `pnpm verify:dev`. Run it only after making that separate container requirement explicit for the operator.

## Onboard the DEV administrator

Create the login-capable user in Dashboard Auth first. Then open `docs/development/sql/onboard-vqh-dev-admin.sql`, replace only the sentinel email, and run it once in Supabase SQL Editor. If the committed file was edited locally, restore it after the operator run.

## CI/fallback

`db:local:*`, `supabase:start`, and `supabase:stop` exist only for an isolated CI/fallback environment. They are not invoked by `verify:dev` and are not part of the daily Cloud DEV workflow.

## Safety

Never use remote reset, seed, `migration repair`, or service-role/public variables without a separate diagnosis and an explicit decision.
