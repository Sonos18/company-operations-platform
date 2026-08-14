# Local backend development

## Prerequisites

- Node.js 24.x
- pnpm 10.29.3
- Docker Desktop running

If Docker Desktop was just installed for the current Windows user, open a new terminal so its CLI path is picked up. If `docker version` is still not found, add Docker Desktop's per-user CLI directory for the current PowerShell session:

```powershell
$env:Path = "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin;$env:Path"
docker version
```

## First startup

```powershell
pnpm install
pnpm supabase:start
Copy-Item .env.example .env.local
pnpm exec supabase status
```

Copy only the local API URL and local anon key printed by `pnpm exec supabase status` into `.env.local` before starting Nuxt. Do not commit `.env.local` or add a service-role key; application request paths use only the public URL and anon key.

Then prepare the local database and start the app:

```powershell
pnpm db:local:reset
pnpm db:local:types
pnpm dev
```

Only `pnpm dev` passes `--dotenv .env.local`; `pnpm build` ignores `.env.local` and receives its public Supabase values from the deploy environment.

## Database workflow

```powershell
pnpm exec supabase migration new descriptive_name
pnpm db:local:reset
pnpm db:local:test
pnpm db:local:types
```

Never edit `shared/types/database.types.ts` manually.

## Verification

Start local Supabase before the release gate. `pnpm verify:backend` intentionally does not start or stop containers, so it can fail clearly when the local database is unavailable.

```powershell
pnpm supabase:start
pnpm verify:backend
git diff --exit-code -- shared/types/database.types.ts
```

## Shutdown

```powershell
pnpm supabase:stop
```

The frontend remains on mock repositories in this phase. The next plan consumes the authenticated session and company-context APIs.
