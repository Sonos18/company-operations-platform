# Cloud DEV backend development

## Prerequisites

- Node.js 24.x
- pnpm 10.29.3
- A dedicated Supabase Cloud DEV project
- Supabase CLI authentication

Docker is not required for the daily workflow. The local application and its database commands use the linked Supabase Cloud DEV project.

## Prepare `.env.local`

```powershell
Copy-Item .env.example .env.local
```

Fill only `NUXT_PUBLIC_SUPABASE_URL` and `NUXT_PUBLIC_SUPABASE_ANON_KEY` with the Cloud DEV URL and public/anon key. Never add a database password, access token, or service-role key to `.env.local`. Do not commit this file.

## One-time DEV link

Run this once from the repository root after creating the dedicated Cloud DEV project:

```powershell
pnpm exec supabase login
$devProjectRef = Read-Host 'Supabase Cloud DEV project ref'
pnpm exec supabase link --project-ref $devProjectRef
Remove-Variable devProjectRef
pnpm db:dev:status
```

The CLI link metadata under `supabase/.temp/` is ignored. Keep the access token and database password outside Git.

## Daily database workflow

```powershell
pnpm exec supabase migration new descriptive_name
pnpm db:dev:status
pnpm db:dev:dry-run
pnpm db:dev:push
pnpm db:dev:types
pnpm verify:app
```

Never edit `shared/types/database.types.ts` manually. `pnpm dev` reads `.env.local`; deployment builds receive their public Supabase values from the deploy environment.

## Optional Docker-backed pgTAP check

`pnpm db:dev:test` runs the Supabase CLI pgTAP runner and requires a Docker/container-capable environment, even when it targets the linked Cloud DEV project. It is optional and must not be added to the daily no-Docker workflow or `pnpm verify:dev`. Run it only after making that separate container requirement explicit for the operator.

## Onboard the DEV administrator

Create the login-capable user in Dashboard Auth first. Then open `docs/development/sql/onboard-vqh-dev-admin.sql`, replace only the sentinel email, and run it once in Supabase SQL Editor. If the committed file was edited locally, restore it after the operator run.

## CI/fallback

`db:local:*`, `supabase:start`, and `supabase:stop` exist only for an isolated CI/fallback environment. They are not invoked by `verify:dev` and are not part of the daily Cloud DEV workflow.

## Safety

Never use remote reset, seed, `migration repair`, or service-role/public variables without a separate diagnosis and an explicit decision.
