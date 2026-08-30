# Supabase Cloud DEV Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make local Nuxt development use a dedicated Supabase Cloud DEV project without running Docker on the developer machine, deploy the existing tenancy schema plus curated VQH bootstrap data, and verify the linked project safely.

**Architecture:** Nuxt continues to read one ignored `.env.local`, but its values now belong to Cloud DEV. Supabase CLI commands are renamed to an explicit `db:dev:*` interface and operate only on the linked DEV project; local Docker commands remain isolated as CI/fallback tools. Version-controlled migrations create schema and VQH tenant/company data, transaction-wrapped pgTAP creates its own test fixtures, and a separate admin SQL snippet assigns a real DEV Auth user without embedding environment-specific identity data in migrations. Taskovia owns the one canonical Supabase Cloud DEV database. VQH is its first tenant/company; there is no separate VQH database.

**Tech Stack:** Node.js 24.19.0, pnpm 10.29.3, Nuxt 4.3.1, TypeScript 5.9.3, Vitest 4.1.9, Supabase CLI 2.114.0, PostgreSQL 17, pgTAP, Supabase Cloud

## Global Constraints

- Local application development reads `.env.local` and connects to the dedicated Supabase Cloud DEV project.
- Vercel Production remains connected to its separate Production project through Vercel Environment Variables; this plan does not modify Production or deploy Vercel.
- Keep `NUXT_PUBLIC_SUPABASE_URL` and `NUXT_PUBLIC_SUPABASE_ANON_KEY` as the only application-facing Supabase variables.
- Never expose or commit a service-role/secret key, database password, Supabase access token, real user email, real user UUID, or CLI link state.
- Never run or add a script for `db reset --linked`, `db push --include-seed`, remote seed, or a remote reset variant using `--project-ref` or `--db-url`.
- Push only migration files under `supabase/migrations`; `supabase/seed.sql` remains local CI/fallback data.
- Cloud DEV receives the VQH tenant and company only; it must not receive the isolation tenant or `.local` Auth users.
- Create every new migration with `pnpm exec supabase migration new descriptive_name` before editing its SQL; never invent a timestamped migration filename.
- Run `db:dev:status` and `db:dev:dry-run` and verify the linked project before any push.
- Remote pgTAP must create fixtures inside `begin`/`rollback` and leave no test data in Cloud DEV.
- Preserve Node.js 24.x, pnpm 10.29.3, Nuxt SPA mode (`ssr: false`), TypeScript strict mode, existing RLS/grants, and mock frontend repositories.

---

### Task 1: Replace the daily Docker workflow with explicit Cloud DEV commands

**Files:**
- Modify: `tests/unit/config/supabase-environment.spec.ts`
- Modify: `.env.example`
- Modify: `package.json`
- Create locally but never stage: `.env.local`

**Interfaces:**
- Consumes: Nuxt runtime keys `public.supabaseUrl` and `public.supabaseAnonKey`; existing ignored `*.local` rule.
- Produces: `db:dev:status`, `db:dev:dry-run`, `db:dev:push`, `db:dev:test`, `db:dev:types`, `verify:app`, `verify:dev`, and `verify:backend:local` package commands.

- [ ] **Step 1: Replace the environment contract with Cloud DEV expectations**

Replace `tests/unit/config/supabase-environment.spec.ts` with:

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
  it('loads an ignored Cloud DEV environment for local Nuxt development', () => {
    expect(packageJson.scripts.dev).toBe('nuxt dev --dotenv .env.local')
    expect(envExample).toContain('# Supabase Cloud DEV')
    expect(envExample).toContain('NUXT_PUBLIC_SUPABASE_URL=')
    expect(envExample).toContain('NUXT_PUBLIC_SUPABASE_ANON_KEY=')
    expect(envExample).not.toContain('127.0.0.1')
  })

  it('leaves production build configuration to the deploy environment', () => {
    expect(packageJson.scripts.build).toBe('nuxt build')
    expect(nuxtConfig).toContain("supabaseUrl: ''")
    expect(nuxtConfig).toContain("supabaseAnonKey: ''")
    expect(nuxtConfig).not.toContain('process.env.NUXT_PUBLIC_SUPABASE')
  })

  it('exposes an explicit linked DEV workflow and an isolated local fallback', () => {
    expect(packageJson.scripts['db:dev:auth-check']).toBe('node scripts/run-supabase-dev.mjs auth-check')
    expect(packageJson.scripts['db:dev:status']).toBe('node scripts/run-supabase-dev.mjs status')
    expect(packageJson.scripts['db:dev:dry-run']).toBe('node scripts/run-supabase-dev.mjs dry-run')
    expect(packageJson.scripts['db:dev:push']).toBe('node scripts/run-supabase-dev.mjs push')
    expect(packageJson.scripts['db:dev:test']).toBe('node scripts/run-supabase-dev.mjs pg-tap')
    expect(packageJson.scripts['db:dev:types']).toBe(
      'node scripts/run-supabase-dev.mjs types',
    )
    expect(packageJson.scripts['verify:app']).toBe(
      'pnpm test:unit && pnpm typecheck && pnpm lint && pnpm build',
    )
    expect(packageJson.scripts['verify:dev']).toBe(
      'pnpm db:dev:status && pnpm db:dev:dry-run && pnpm db:dev:types && pnpm verify:app',
    )
    expect(packageJson.scripts['verify:backend:local']).toContain('pnpm db:local:reset')
  })

  it('rejects legacy aliases and every remote reset or seed variant', () => {
    expect(packageJson.scripts).not.toHaveProperty('db:reset')
    expect(packageJson.scripts).not.toHaveProperty('db:test')
    expect(packageJson.scripts).not.toHaveProperty('db:types')
    expect(Object.keys(packageJson.scripts).filter(name => name.startsWith('db:cloud:'))).toEqual([])

    const remoteTarget = /(?:--linked\b|--project-ref(?:=|\s)|--db-url(?:=|\s))/
    for (const [name, script] of Object.entries(packageJson.scripts)) {
      if (/\bsupabase db reset\b/.test(script)) {
        expect(script, `${name} must reset only the local fallback`).toMatch(/--local\b/)
        expect(script, `${name} must not reset a remote target`).not.toMatch(remoteTarget)
      }
      expect(script, `${name} must not deploy seed data remotely`).not.toMatch(/--include-seed\b/)
    }
  })
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
nvm use 24.19.0
pnpm test:unit tests/unit/config/supabase-environment.spec.ts
```

Expected: FAIL because `.env.example` still points to localhost and `db:dev:*`, `verify:app`, `verify:dev`, and `verify:backend:local` do not exist.

- [ ] **Step 3: Make `.env.example` a Cloud DEV template**

Replace `.env.example` with:

```dotenv
# Copy this file to .env.local for local development only.
# Supabase Cloud DEV: Project Settings > API
NUXT_PUBLIC_SUPABASE_URL=
NUXT_PUBLIC_SUPABASE_ANON_KEY=
```

Do not put a real URL, key, project ref, password, access token, or service-role key in the committed template.

- [ ] **Step 4: Replace ambiguous Cloud scripts and split verification targets**

In `package.json`, keep the existing app/test scripts and set the Supabase/verification scripts to:

```json
{
  "supabase:start": "supabase start",
  "supabase:stop": "supabase stop",
  "db:local:reset": "supabase db reset --local",
  "db:local:test": "supabase test db --local",
  "db:local:types": "supabase gen types typescript --local > shared/types/database.types.ts",
  "db:dev:target": "node scripts/assert-cloud-dev-target.mjs",
  "db:dev:auth-check": "node scripts/run-supabase-dev.mjs auth-check",
  "db:dev:link": "node scripts/run-supabase-dev.mjs link",
  "db:dev:status": "node scripts/run-supabase-dev.mjs status",
  "db:dev:dry-run": "node scripts/run-supabase-dev.mjs dry-run",
  "db:dev:push": "node scripts/run-supabase-dev.mjs push",
  "db:dev:test": "node scripts/run-supabase-dev.mjs pg-tap",
  "db:dev:types": "node scripts/run-supabase-dev.mjs types",
  "verify:app": "pnpm test:unit && pnpm typecheck && pnpm lint && pnpm build",
  "verify:dev": "pnpm db:dev:status && pnpm db:dev:dry-run && pnpm db:dev:types && pnpm verify:app",
  "verify:backend:local": "pnpm db:local:reset && pnpm db:local:test && pnpm db:local:types && pnpm verify:app"
}
```

Remove `db:cloud:status`, `db:cloud:dry-run`, `db:cloud:push`, and `verify:backend`. Do not remove the explicitly local commands; they remain available only for CI/fallback.

- [ ] **Step 5: Run focused verification and verify GREEN**

Run:

```powershell
pnpm test:unit tests/unit/config/supabase-environment.spec.ts
pnpm typecheck
pnpm lint
git diff --check
```

Expected: 4 focused tests PASS; typecheck, lint, and diff check exit 0 without starting Docker.

- [ ] **Step 6: Create the ignored local file and prove Git will not track it**

Run:

```powershell
if (Test-Path -LiteralPath '.env.local') { throw '.env.local already exists; inspect it without printing secrets before continuing' }
Copy-Item -LiteralPath '.env.example' -Destination '.env.local'
git check-ignore -v .env.local
git status --short --untracked-files=all
```

Expected: `git check-ignore` reports the repository `*.local` rule; `.env.local` is absent from `git status`. Stop here and tell the user that `.env.local` is ready for their DEV URL/key, but Task 2 and Task 3 may continue because they do not require credentials.

- [ ] **Step 7: Commit Task 1 without `.env.local`**

```powershell
git add .env.example package.json tests/unit/config/supabase-environment.spec.ts
git diff --cached --check
git commit -m "build: make Cloud DEV the local backend target"
```

---

### Task 2: Make pgTAP independent of local seed data

**Files:**
- Create: `tests/unit/config/supabase-cloud-dev-pgtap.spec.ts`
- Modify: `supabase/tests/database/tenancy_rls.test.sql`

**Interfaces:**
- Consumes: existing tenancy migration, pgTAP test runner, and `auth.uid()`-based RLS policies.
- Produces: transaction-scoped users, tenants, companies, and memberships that exist only during `tenancy_rls.test.sql` and are always rolled back.

- [ ] **Step 1: Write the failing pgTAP isolation contract**

Create `tests/unit/config/supabase-cloud-dev-pgtap.spec.ts`:

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')
const rlsTest = readFileSync(
  resolve(root, 'supabase/tests/database/tenancy_rls.test.sql'),
  'utf8',
)

describe('Cloud DEV pgTAP isolation', () => {
  it('creates all RLS fixtures before assuming the authenticated role', () => {
    const fixtureStart = rlsTest.indexOf('insert into auth.users')
    const authenticatedRole = rlsTest.indexOf('set local role authenticated')

    expect(rlsTest.trimStart().startsWith('begin;')).toBe(true)
    expect(fixtureStart).toBeGreaterThan(0)
    expect(fixtureStart).toBeLessThan(authenticatedRole)
    expect(rlsTest).toContain("'test-a'")
    expect(rlsTest).toContain("'test-b'")
  })

  it('does not depend on persistent VQH or isolation seed rows', () => {
    expect(rlsTest).not.toContain("array['vqh']")
    expect(rlsTest).not.toContain("array['ISO']")
    expect(rlsTest.trimEnd().endsWith('rollback;')).toBe(true)
  })
})
```

- [ ] **Step 2: Run the focused test and verify RED**

```powershell
pnpm test:unit tests/unit/config/supabase-cloud-dev-pgtap.spec.ts
```

Expected: FAIL because the RLS pgTAP file currently reads fixtures supplied by `seed.sql` and contains no fixture inserts.

- [ ] **Step 3: Add transaction-scoped RLS fixtures**

In `supabase/tests/database/tenancy_rls.test.sql`, immediately after `select plan(8);`, insert:

```sql
insert into auth.users (id, email) values
  ('31000000-0000-4000-8000-000000000001', 'test-a@rls.invalid'),
  ('32000000-0000-4000-8000-000000000001', 'test-b@rls.invalid');

insert into public.tenants (id, code, name) values
  ('31000000-0000-4000-8000-000000000010', 'test-a', 'RLS tenant A'),
  ('32000000-0000-4000-8000-000000000010', 'test-b', 'RLS tenant B');

insert into public.companies (id, tenant_id, code, name) values
  ('31000000-0000-4000-8000-000000000020', '31000000-0000-4000-8000-000000000010', 'TEST-A', 'RLS company A'),
  ('32000000-0000-4000-8000-000000000020', '32000000-0000-4000-8000-000000000010', 'TEST-B', 'RLS company B');

insert into public.tenant_memberships (user_id, tenant_id, roles) values
  ('31000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000010', array['tenant_admin']),
  ('32000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000010', array['tenant_admin']);

insert into public.company_memberships (user_id, tenant_id, company_id, roles) values
  ('31000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000010', '31000000-0000-4000-8000-000000000020', array['director']),
  ('32000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000010', '32000000-0000-4000-8000-000000000020', array['director']);
```

Change the first JWT subject to `31000000-0000-4000-8000-000000000001` and the second to `32000000-0000-4000-8000-000000000001`. Update the expected visible values and IDs:

```sql
array['test-a']::text[]
array['TEST-A']::text[]
array['31000000-0000-4000-8000-000000000010']::text[]
array['31000000-0000-4000-8000-000000000020']::text[]
```

The first cross-tenant `is_empty` must target company `32000000-0000-4000-8000-000000000020`. The forbidden insert must use tenant `31000000-0000-4000-8000-000000000010`. After switching to the second user, expect `array['TEST-B']::text[]` and verify company `31000000-0000-4000-8000-000000000020` remains invisible. Keep the existing `begin`, `finish()`, and final `rollback` unchanged.

- [ ] **Step 4: Run focused and app-level verification**

```powershell
pnpm test:unit tests/unit/config/supabase-cloud-dev-pgtap.spec.ts
pnpm test:unit
pnpm typecheck
pnpm lint
git diff --check
```

Expected: the 2 focused tests and all unit tests PASS; typecheck, lint, and diff check exit 0. Do not start Docker; behavioral pgTAP verification occurs against Cloud DEV in Task 4.

- [ ] **Step 5: Commit Task 2**

```powershell
git add tests/unit/config/supabase-cloud-dev-pgtap.spec.ts supabase/tests/database/tenancy_rls.test.sql
git diff --cached --check
git commit -m "test: isolate Cloud DEV RLS fixtures"
```

---

### Task 3: Document Cloud DEV operation and real-user onboarding

**Files:**
- Create: `tests/unit/config/supabase-cloud-dev-docs.spec.ts`
- Create: `docs/development/sql/onboard-vqh-dev-admin.sql`
- Modify: `README.md`
- Modify: `docs/development/backend-cloud-dev.md`
- Modify: `docs/deployment/supabase-cloud-vercel.md`

**Interfaces:**
- Consumes: Task 1 `db:dev:*` and verification scripts; stable VQH tenant/company IDs.
- Produces: a no-Docker daily runbook, a DEV/Production boundary runbook, and an idempotent SQL Editor onboarding snippet keyed by a sentinel email.

- [ ] **Step 1: Write the failing documentation contract**

Create `tests/unit/config/supabase-cloud-dev-docs.spec.ts`:

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')
const readme = read('README.md')
const development = read('docs/development/backend-cloud-dev.md')
const deployment = read('docs/deployment/supabase-cloud-vercel.md')
const onboarding = read('docs/development/sql/onboard-vqh-dev-admin.sql')

describe('Supabase Cloud DEV runbooks', () => {
  it('makes Cloud DEV the default local-app backend without requiring Docker', () => {
    expect(readme).toContain('Supabase Cloud DEV')
    expect(development).toContain('pnpm db:dev:dry-run')
    expect(development).toContain('## Optional Docker-backed pgTAP check')
    expect(development).not.toContain('Docker Desktop running')
    expect(development).not.toContain('pnpm supabase:start')
  })

  it('keeps DEV and Vercel Production credentials separate', () => {
    expect(deployment).toContain('Cloud DEV')
    expect(deployment).toContain('Vercel Production')
    expect(deployment).toContain('không dùng project DEV')
    expect(deployment).not.toContain('pnpm db:cloud:')
  })

  it('provides a guarded, idempotent VQH admin onboarding snippet', () => {
    expect(onboarding).toContain('replace-with-dev-admin@example.com')
    expect(onboarding).toContain("raise exception 'Replace the DEV admin email before running this script'")
    expect(onboarding).toContain("'10000000-0000-4000-8000-000000000010'")
    expect(onboarding).toContain("'10000000-0000-4000-8000-000000000020'")
    expect(onboarding).toContain('on conflict (user_id, tenant_id) do update')
    expect(onboarding).toContain('on conflict (user_id, company_id) do update')
    expect(onboarding).not.toContain('@vqh.local')
  })
})
```

- [ ] **Step 2: Run the focused test and verify RED**

```powershell
pnpm test:unit tests/unit/config/supabase-cloud-dev-docs.spec.ts
```

Expected: FAIL because the onboarding SQL file is missing and the current runbooks still require Supabase local/Docker.

- [ ] **Step 3: Create the guarded onboarding SQL**

Create `docs/development/sql/onboard-vqh-dev-admin.sql`:

```sql
do $$
declare
  target_email constant text := 'replace-with-dev-admin@example.com';
  target_user_id uuid;
begin
  if target_email = 'replace-with-dev-admin@example.com' then
    raise exception 'Replace the DEV admin email before running this script';
  end if;

  select id into target_user_id
  from auth.users
  where lower(email) = lower(target_email);

  if target_user_id is null then
    raise exception 'No Supabase Auth user found for %', target_email;
  end if;

  insert into public.tenant_memberships (user_id, tenant_id, roles)
  values (
    target_user_id,
    '10000000-0000-4000-8000-000000000010',
    array['tenant_admin']
  )
  on conflict (user_id, tenant_id) do update
    set roles = excluded.roles;

  insert into public.company_memberships (user_id, tenant_id, company_id, roles)
  values (
    target_user_id,
    '10000000-0000-4000-8000-000000000010',
    '10000000-0000-4000-8000-000000000020',
    array['director']
  )
  on conflict (user_id, company_id) do update
    set tenant_id = excluded.tenant_id,
        roles = excluded.roles;
end
$$;
```

This file is an operator snippet, not a migration. The sentinel prevents accidental execution before the user creates a real Auth account and replaces the email in Supabase SQL Editor.

- [ ] **Step 4: Rewrite the daily-development runbook**

Update `docs/development/backend-cloud-dev.md` with these sections and commands:

1. `Prerequisites`: Node 24.x, pnpm 10.29.3, a dedicated Supabase Cloud DEV project, and an ignored dedicated CLI PAT; explicitly state Docker is not required for the daily workflow.
2. `Prepare .env.local`: run `Copy-Item .env.example .env.local`, fill only Cloud DEV URL/public key, and never add database password, access token, or service-role key.
3. `One-time DEV link`:

```powershell
pnpm db:dev:auth-check
pnpm db:dev:link
pnpm db:dev:status
```

4. `Daily database workflow`:

```powershell
pnpm exec supabase migration new descriptive_name
pnpm db:dev:status
pnpm db:dev:dry-run
pnpm db:dev:push
pnpm db:dev:types
pnpm verify:app
```

`pnpm db:dev:test` is an optional Docker/container-capable pgTAP check and is outside this daily no-Docker workflow and `verify:dev`.

5. `Onboard the DEV administrator`: create the login-capable user in Dashboard Auth, open `docs/development/sql/onboard-vqh-dev-admin.sql`, replace only the sentinel email, run it once in SQL Editor, then restore the committed file if it was edited locally.
6. `CI/fallback`: document that `db:local:*`, `supabase:start`, and `supabase:stop` exist only for an isolated CI/fallback environment and are not invoked by `verify:dev`.
7. `Safety`: never use remote reset, seed, `migration repair`, or service-role/public variables without a separate diagnosis and explicit decision.

- [ ] **Step 5: Correct the README and Production runbook**

In `README.md`:

- Replace “Supabase local” in the stack/testing overview with “Supabase Cloud DEV for daily development; Supabase local only for CI/fallback”.
- State that `.env.local` points to Cloud DEV.
- Link the existing development and deployment runbooks.

In `docs/deployment/supabase-cloud-vercel.md`:

- Rename the linking section to `Cloud DEV link` and use `db:dev:*` commands.
- State explicitly: `CLI đang link Cloud DEV; không dùng project DEV hoặc link hiện tại để triển khai Vercel Production.`
- Keep the two Vercel Production variables and the prohibition on public service-role keys.
- Remove every `db:cloud:*` command and every local-Docker prerequisite from the active workflow.
- State that Production migration automation/relinking is outside this plan and must be designed separately before production data exists.

- [ ] **Step 6: Run focused verification and verify GREEN**

```powershell
pnpm test:unit tests/unit/config/supabase-cloud-dev-docs.spec.ts
pnpm test:unit
pnpm typecheck
pnpm lint
git diff --check
```

Expected: 3 focused documentation tests and the full unit suite PASS; typecheck, lint, and diff check exit 0 without Docker.

- [ ] **Step 7: Commit Task 3**

```powershell
git add README.md docs/development/backend-cloud-dev.md docs/deployment/supabase-cloud-vercel.md docs/development/sql/onboard-vqh-dev-admin.sql tests/unit/config/supabase-cloud-dev-docs.spec.ts
git diff --cached --check
git commit -m "docs: add Cloud DEV and VQH onboarding workflow"
```

---

### Task 4: Bootstrap and verify the linked Supabase Cloud DEV project

**Files:**
- Create: `tests/unit/config/supabase-cloud-dev-data.spec.ts`
- Create via Supabase CLI: the single file ending in `supabase/migrations/*_bootstrap_vqh_tenant.sql`
- Regenerate if changed: `shared/types/database.types.ts`
- Read but never stage: `.env.local`, `supabase/.temp/*`

**Interfaces:**
- Consumes: Task 1 linked DEV commands, Task 2 transaction-safe pgTAP, Task 3 onboarding snippet, existing tenancy migration, user-supplied `.env.local` values, and the ignored dedicated `.supabase.dev.env.local` PAT.
- Produces: Cloud DEV migration history containing the tenancy foundation and VQH bootstrap migration; VQH tenant/company rows; generated types matching DEV; one real Auth user with VQH memberships after the manual checkpoint.

- [ ] **Step 1: Write the failing VQH bootstrap migration contract**

Create `tests/unit/config/supabase-cloud-dev-data.spec.ts`:

```ts
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../../..')
const migrationsDir = resolve(root, 'supabase/migrations')

describe('Cloud DEV VQH bootstrap migration', () => {
  it('contains only idempotent VQH tenant and company data', () => {
    const filename = readdirSync(migrationsDir)
      .find(name => name.endsWith('_bootstrap_vqh_tenant.sql'))

    expect(filename).toBeDefined()
    const sql = readFileSync(resolve(migrationsDir, filename!), 'utf8')

    expect(sql).toContain("'10000000-0000-4000-8000-000000000010', 'vqh'")
    expect(sql).toContain("'10000000-0000-4000-8000-000000000020'")
    expect(sql).toMatch(/'10000000-0000-4000-8000-000000000010',\s*'VQH'/)
    expect(sql.match(/on conflict do nothing/g)).toHaveLength(2)
    expect(sql).not.toMatch(/auth\.users|tenant_memberships|company_memberships/i)
    expect(sql).not.toMatch(/isolation|\.local/i)
  })
})
```

- [ ] **Step 2: Run the focused test and verify RED**

```powershell
pnpm test:unit tests/unit/config/supabase-cloud-dev-data.spec.ts
```

Expected: FAIL because no migration ending in `_bootstrap_vqh_tenant.sql` exists.

- [ ] **Step 3: Create the migration through the Supabase CLI**

Run exactly:

```powershell
pnpm exec supabase migration new bootstrap_vqh_tenant
```

Capture the path printed by the CLI and verify exactly one new file ends in `_bootstrap_vqh_tenant.sql`:

```powershell
$bootstrapMigration = Get-ChildItem -LiteralPath 'supabase/migrations' -File |
  Where-Object Name -Like '*_bootstrap_vqh_tenant.sql'
if (@($bootstrapMigration).Count -ne 1) { throw 'Expected exactly one CLI-generated bootstrap migration' }
$bootstrapMigration.FullName
```

- [ ] **Step 4: Add only the approved VQH data to the CLI-generated migration**

Use `apply_patch` on the exact file returned by Step 3 and set its entire SQL content to:

```sql
insert into public.tenants (id, code, name) values
  ('10000000-0000-4000-8000-000000000010', 'vqh', 'Việt Quốc Huy')
on conflict do nothing;

insert into public.companies (id, tenant_id, code, name) values
  (
    '10000000-0000-4000-8000-000000000020',
    '10000000-0000-4000-8000-000000000010',
    'VQH',
    'Việt Quốc Huy'
  )
on conflict do nothing;
```

Do not edit `supabase/seed.sql`; do not insert Auth users or memberships in this migration.

- [ ] **Step 5: Run the focused test and verify GREEN**

```powershell
pnpm test:unit tests/unit/config/supabase-cloud-dev-data.spec.ts
pnpm test:unit
git diff --check
```

Expected: the focused data contract and full unit suite PASS; diff check exits 0.

- [ ] **Step 6: Stop for the user-managed credential checkpoint**

Do not print `.env.local`. Ask the user to confirm both Cloud DEV variables have been filled. Then validate presence without echoing values:

```powershell
$devEnv = @{}
Get-Content -LiteralPath '.env.local' | ForEach-Object {
  if ($_ -match '^(NUXT_PUBLIC_SUPABASE_[A-Z_]+)=(.+)$') { $devEnv[$matches[1]] = $matches[2].Trim() }
}
if (-not [uri]::IsWellFormedUriString($devEnv['NUXT_PUBLIC_SUPABASE_URL'], [System.UriKind]::Absolute)) {
  throw 'NUXT_PUBLIC_SUPABASE_URL is missing or invalid'
}
if ([string]::IsNullOrWhiteSpace($devEnv['NUXT_PUBLIC_SUPABASE_ANON_KEY'])) {
  throw 'NUXT_PUBLIC_SUPABASE_ANON_KEY is missing'
}
Write-Output 'Cloud DEV application variables are present; values were not printed.'
```

Expected: one success message and no URL/key in terminal output. If validation fails, stop and let the user edit `.env.local`.

- [ ] **Step 7: Authenticate and link interactively without putting credentials in command history**

Run:

```powershell
pnpm db:dev:auth-check
pnpm db:dev:link
```

The ignored `.supabase.dev.env.local` PAT is authoritative. It contains exactly one `SUPABASE_DEV_ACCESS_TOKEN=` assignment and is mapped only to the CLI child after ambient credentials are stripped. Never use browser login, a database password, `--profile`, or a frontend environment file for CLI authorization.

- [ ] **Step 8: Prove the linked target and dry-run scope before changing Cloud DEV**

```powershell
pnpm db:dev:status
pnpm db:dev:dry-run
```

Expected for a new DEV project: the remote side has no application migrations and the dry-run lists only `20260814000100_create_tenancy_foundation.sql` plus the single CLI-generated `_bootstrap_vqh_tenant.sql`. If any other migration, existing application table, Production project ref, seed, reset, destructive DDL beyond the reviewed foundation, or history mismatch appears, stop without pushing.

- [ ] **Step 9: Push the reviewed migrations to Cloud DEV**

Only after Step 8 matches exactly, run:

```powershell
pnpm db:dev:push
pnpm db:dev:status
```

Expected: both local migrations appear applied remotely and there is no pending migration. Do not add `--include-seed`.

- [ ] **Step 10: Run Cloud database verification and advisors**

### Optional Docker/container-capable pgTAP verification

`pnpm db:dev:test` runs the Supabase CLI pgTAP runner in a Docker/container-capable environment, even when it targets the linked Cloud DEV project. It is optional and must not be treated as part of the required no-Docker verification or release gate.

```powershell
pnpm db:dev:test
```

Expected when this optional check is run in a suitable container-capable environment: all pgTAP files PASS and roll back their fixtures.

### Required linked Cloud verification and advisors

```powershell
pnpm db:dev:types
pnpm db:dev:advisors:security
pnpm db:dev:advisors:performance
```

Expected: type generation exits 0; neither advisor reports an error-level finding introduced by these migrations. Record warning-level findings for review rather than silently ignoring them.

- [ ] **Step 11: Query Cloud DEV for the approved data boundary**

Run:

```powershell
pnpm db:dev:canonical-check
```

Expected result: `vqh_tenants = 1`, `vqh_companies = 1`, `isolation_tenants = 0`, and `local_auth_users = 0`.

- [ ] **Step 12: Stop for real DEV Auth user onboarding**

Ask the user to:

1. Create a login-capable DEV user in Supabase Dashboard > Authentication > Users.
2. Open `docs/development/sql/onboard-vqh-dev-admin.sql` in the Supabase SQL Editor.
3. Replace `replace-with-dev-admin@example.com` only in the `target_email` declaration, leaving the guard sentinel unchanged.
4. Run the snippet once and report completion without sharing the password or token.

After confirmation, verify membership counts without printing identity data:

```powershell
pnpm db:dev:rls-smoke
```

Expected: both counts are at least 1. If either is 0, stop and diagnose the Auth user lookup/onboarding transaction; do not insert a fake `auth.users` row.

- [ ] **Step 13: Run the no-Docker release gate and generated-types check**

Use a session pinned to Node 24.19.0, then run:

```powershell
$taskNodeDir = 'C:\Users\NGUYEN HONG SON\AppData\Local\nvm\v24.19.0'
$env:Path = "$taskNodeDir;$env:Path"
node -v
pnpm exec node -v
pnpm verify:dev
git diff --exit-code -- shared/types/database.types.ts
pnpm test:e2e
git diff --check
```

Expected: both Node commands report `v24.19.0`; linked migration status and dry-run succeed; type generation, unit tests, typecheck, lint, build, and E2E PASS; generated types and diff check are clean. Docker remains stopped.

- [ ] **Step 14: Prove no secret or CLI link state can be committed**

```powershell
git check-ignore -v .env.local .supabase.dev.env.local supabase/.temp
git status --short --untracked-files=all
git grep -n -E 'sb_secret_|SUPABASE_ACCESS_TOKEN=|postgres(ql)?://[^[:space:]]+:[^[:space:]]+@' -- ':!docs/superpowers/plans/*'
```

Expected: `.env.local`, `.supabase.dev.env.local`, and `supabase/.temp` are ignored and absent from status; the tracked-secret scan returns no match. The tracked `.supabase.dev.env.example` contains only the blank assignment line, while the PAT file must never be inspected, staged, or passed through shell arguments. Intended uncommitted files are only the bootstrap migration, its contract test, and `shared/types/database.types.ts` if the generator produced a legitimate schema change.

- [ ] **Step 15: Commit the verified migration artifacts**

Resolve the CLI-generated migration path again and commit only intended files:

```powershell
$bootstrapMigration = Get-ChildItem -LiteralPath 'supabase/migrations' -File |
  Where-Object Name -Like '*_bootstrap_vqh_tenant.sql'
if (@($bootstrapMigration).Count -ne 1) { throw 'Expected exactly one bootstrap migration' }
git add -- $bootstrapMigration.FullName tests/unit/config/supabase-cloud-dev-data.spec.ts shared/types/database.types.ts
git diff --cached --check
git diff --cached --stat
git commit -m "data: bootstrap VQH in Cloud DEV"
git status --short
```

Expected: commit succeeds; `.env.local`, real credentials, user identity, and `supabase/.temp` are not staged; final worktree is clean.
