# Supabase Local and Cloud Environments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make local Nuxt development always use Supabase local through `.env.local`, while local CLI commands safely deploy tested migrations to the linked Supabase Cloud project and Vercel Production receives Cloud configuration from its environment variables.

**Architecture:** Nuxt exposes one public runtime-config interface with empty defaults and lets matching `NUXT_PUBLIC_*` variables supply values. The dev script explicitly loads `.env.local`; the production build loads no local dotenv file and therefore consumes Vercel Production variables. Supabase CLI scripts make local and linked-Cloud targets explicit and never expose a remote reset or seed command.

**Tech Stack:** Nuxt 4.3.1, TypeScript 5.9.3, Vitest 4.1.9, Supabase CLI 2.114.0, Supabase Cloud, Vercel

## Global Constraints

- Local application development uses `.env.local` and Supabase local at `http://127.0.0.1:54321`.
- Cloud migrations are run from the developer machine through a Supabase CLI linked project.
- Vercel Production supplies `NUXT_PUBLIC_SUPABASE_URL` and `NUXT_PUBLIC_SUPABASE_ANON_KEY`; no Cloud value is committed.
- Never expose or commit a service-role key, database password, Supabase access token, or Vercel secret.
- Never add a `db reset --linked` or remote seed script.
- Every database change is reset and pgTAP-tested locally before Cloud dry-run and push.
- Preserve Node.js 24.x, pnpm 10.29.3, Nuxt SPA mode (`ssr: false`), TypeScript strict mode, and the existing mock frontend repositories.

---

### Task 1: Encode local, Cloud, and Vercel environment boundaries

**Files:**
- Create: `tests/unit/config/supabase-environment.spec.ts`
- Modify: `nuxt.config.ts`
- Modify: `.env.example`
- Modify: `package.json`

**Interfaces:**
- Consumes: Nuxt runtime keys `public.supabaseUrl` and `public.supabaseAnonKey`.
- Produces: `pnpm dev` bound to `.env.local`; explicit `db:local:*` and `db:cloud:*` commands; production-safe `pnpm build`.

- [ ] **Step 1: Write the failing environment contract test**

Create `tests/unit/config/supabase-environment.spec.ts`:

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>
}
const envExample = readFileSync(resolve(root, '.env.example'), 'utf8')
const nuxtConfig = readFileSync(resolve(root, 'nuxt.config.ts'), 'utf8')

describe('Supabase environment wiring', () => {
  it('loads only .env.local for local Nuxt development', () => {
    expect(packageJson.scripts.dev).toBe('nuxt dev --dotenv .env.local')
    expect(envExample).toContain('# Copy this file to .env.local')
    expect(envExample).toContain('NUXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321')
  })

  it('leaves production build configuration to the deploy environment', () => {
    expect(packageJson.scripts.build).toBe('nuxt build')
    expect(nuxtConfig).toContain("supabaseUrl: ''")
    expect(nuxtConfig).toContain("supabaseAnonKey: ''")
    expect(nuxtConfig).not.toContain('process.env.NUXT_PUBLIC_SUPABASE')
  })

  it('makes every database target explicit', () => {
    expect(packageJson.scripts['db:local:reset']).toBe('supabase db reset --local')
    expect(packageJson.scripts['db:local:test']).toBe('supabase test db --local')
    expect(packageJson.scripts['db:local:types']).toBe(
      'supabase gen types typescript --local > shared/types/database.types.ts',
    )
    expect(packageJson.scripts['db:cloud:status']).toBe('supabase migration list --linked')
    expect(packageJson.scripts['db:cloud:dry-run']).toBe('supabase db push --linked --dry-run')
    expect(packageJson.scripts['db:cloud:push']).toBe('supabase db push --linked')
    expect(Object.values(packageJson.scripts)).not.toContain('supabase db reset --linked')
  })
})
```

- [ ] **Step 2: Run the contract test and verify RED**

Run:

```powershell
nvm use 24.19.0
pnpm test:unit tests/unit/config/supabase-environment.spec.ts
```

Expected: FAIL because `dev` does not select `.env.local`, the target-explicit scripts do not exist, and Nuxt currently reads `process.env` directly.

- [ ] **Step 3: Make Nuxt runtime config environment-native**

Replace only the Supabase public defaults in `nuxt.config.ts`:

```ts
runtimeConfig: {
  public: {
    supabaseUrl: '',
    supabaseAnonKey: '',
  },
},
```

Nuxt maps `NUXT_PUBLIC_SUPABASE_URL` and `NUXT_PUBLIC_SUPABASE_ANON_KEY` to these keys. Do not add a production conditional or service-role runtime key.

- [ ] **Step 4: Make `.env.example` an explicit local template**

Set `.env.example` to:

```dotenv
# Copy this file to .env.local for local development only.
NUXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NUXT_PUBLIC_SUPABASE_ANON_KEY=replace-with-local-anon-key-from-supabase-status
```

`.env.local` remains ignored through the repository's existing `*.local` rule.

- [ ] **Step 5: Add target-explicit package scripts**

In `package.json`:

```json
{
  "scripts": {
    "dev": "nuxt dev --dotenv .env.local",
    "build": "nuxt build",
    "db:local:reset": "supabase db reset --local",
    "db:local:test": "supabase test db --local",
    "db:local:types": "supabase gen types typescript --local > shared/types/database.types.ts",
    "db:cloud:status": "supabase migration list --linked",
    "db:cloud:dry-run": "supabase db push --linked --dry-run",
    "db:cloud:push": "supabase db push --linked",
    "verify:backend": "pnpm db:local:reset && pnpm db:local:test && pnpm db:local:types && pnpm test:unit && pnpm typecheck && pnpm lint && pnpm build"
  }
}
```

Remove the ambiguous `db:reset`, `db:test`, and `db:types` aliases after updating every repository reference in Task 2. Keep `supabase:start` and `supabase:stop` unchanged.

- [ ] **Step 6: Run focused and static verification**

Run:

```powershell
pnpm test:unit tests/unit/config/supabase-environment.spec.ts
pnpm typecheck
pnpm lint
git diff --check
```

Expected: 3 focused tests PASS; typecheck, lint, and diff check exit 0.

- [ ] **Step 7: Commit Task 1**

```powershell
git add .env.example nuxt.config.ts package.json tests/unit/config/supabase-environment.spec.ts
git commit -m "build: separate Supabase environment targets"
```

---

### Task 2: Document Cloud linking, migration deployment, and Vercel configuration

**Files:**
- Modify: `README.md`
- Modify: `docs/development/backend-cloud-dev.md`
- Create: `docs/deployment/supabase-cloud-vercel.md`

**Interfaces:**
- Consumes: all Task 1 package scripts and the two `NUXT_PUBLIC_*` variables.
- Produces: an operator runbook for initial Cloud link, repeatable migration delivery, Vercel Production configuration, and rollback-safe verification.

- [ ] **Step 1: Update the local-development runbook**

Change `docs/development/backend-cloud-dev.md` so first startup is:

```powershell
pnpm install
pnpm supabase:start
Copy-Item .env.example .env.local
pnpm exec supabase status
```

Tell the developer to copy only the local API URL and local anon key into `.env.local`, then run:

```powershell
pnpm db:local:reset
pnpm db:local:types
pnpm dev
```

Replace all ambiguous database commands with `db:local:*`. State that `pnpm build` ignores `.env.local` because only `pnpm dev` passes `--dotenv .env.local`.

- [ ] **Step 2: Write the Cloud and Vercel runbook**

Create `docs/deployment/supabase-cloud-vercel.md` with these exact sections and commands:

````markdown
# Supabase Cloud and Vercel production

## One-time Supabase Cloud link

1. Create the VQH project in Supabase Cloud.
2. Copy its project ref from the Dashboard project URL.
3. Authenticate and link from the repository root:

```powershell
pnpm exec supabase login
pnpm exec supabase link --project-ref <project-ref>
pnpm db:cloud:status
```

The access token and database password must stay outside Git. The CLI link metadata under `supabase/.temp/` is ignored.

## Deploy a database migration

```powershell
pnpm exec supabase migration new descriptive_name
pnpm db:local:reset
pnpm db:local:test
pnpm verify:backend
pnpm db:cloud:status
pnpm db:cloud:dry-run
pnpm db:cloud:push
pnpm db:cloud:status
```

Never run `supabase db reset --linked` and never add `--include-seed` for this Cloud project.

## Configure Vercel Production

Add these variables to the Vercel project with the `Production` scope:

- `NUXT_PUBLIC_SUPABASE_URL`: the Cloud project URL.
- `NUXT_PUBLIC_SUPABASE_ANON_KEY`: the Cloud public/anon key.

Redeploy Production after changing either value. Do not add a service-role key to any `NUXT_PUBLIC_*` variable. Preview deployments receive no Cloud configuration unless the same variables are deliberately added to the `Preview` scope.

## Verify after deployment

Check `/api/health`, authentication/session resolution, company-context access for a VQH member, and denial for a user outside that company. Review Supabase logs and Vercel runtime logs without copying tokens into issues or commits.
````

Use correctly nested fences in the actual Markdown file.

- [ ] **Step 3: Link the runbooks from README**

Add a concise “Môi trường Supabase” section to `README.md`:

```markdown
## Môi trường Supabase

- Development app: Supabase local through `.env.local`.
- Database delivery: local Supabase CLI linked to the VQH Cloud project.
- Production app: Supabase Cloud variables supplied by Vercel Production.

See [Cloud DEV backend development](docs/development/backend-cloud-dev.md) and [Supabase Cloud and Vercel production](docs/deployment/supabase-cloud-vercel.md).
```

- [ ] **Step 4: Verify local environment and regression suite**

With Docker Desktop and Supabase local running:

```powershell
$env:Path = "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin;$env:Path"
nvm use 24.19.0
pnpm supabase:start
pnpm verify:backend
git diff --exit-code -- shared/types/database.types.ts
pnpm test:e2e
```

Expected: pgTAP 27/27, unit suite PASS including the 3 new contract tests, typecheck/lint/build PASS, generated types clean, and E2E 37/37.

- [ ] **Step 5: Verify production-build variable injection without secrets**

Run a build with disposable syntactically valid values supplied only to the process:

```powershell
$env:NUXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
$env:NUXT_PUBLIC_SUPABASE_ANON_KEY = 'test-public-key'
pnpm build
Remove-Item Env:\NUXT_PUBLIC_SUPABASE_URL
Remove-Item Env:\NUXT_PUBLIC_SUPABASE_ANON_KEY
```

Expected: build exits 0 and no `.env.production`, Cloud URL, real key, database password, access token, or service-role key is created in the worktree.

- [ ] **Step 6: Run secret and target-safety scans**

```powershell
rg -n "service[_-]?role|SUPABASE_ACCESS_TOKEN|DATABASE_PASSWORD" .env.example README.md docs nuxt.config.ts package.json
rg -n "db reset --linked|include-seed" package.json
git status --short
git diff --check
```

Expected: the first scan finds only explanatory “do not use” documentation, the second scan returns no package-script match, the worktree contains only intended Task 2 files, and diff check exits 0.

- [ ] **Step 7: Commit Task 2**

```powershell
git add README.md docs/development/backend-cloud-dev.md docs/deployment/supabase-cloud-vercel.md
git commit -m "docs: add Supabase Cloud deployment runbook"
```
