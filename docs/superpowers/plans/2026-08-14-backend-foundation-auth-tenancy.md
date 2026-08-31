# Backend Foundation, Auth, and Tenant Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the production backend foundation for VQH with local Supabase tooling, authenticated Nitro requests, trusted company context, and database-enforced tenant isolation.

**Architecture:** Keep the Nuxt SPA and mock repositories active while adding a Nitro modular-monolith backend beside them. Each protected request carries a Supabase JWT, uses a user-scoped Supabase client, and derives tenant context from company membership; PostgreSQL RLS remains the final isolation boundary.

**Tech Stack:** Node.js 24, Nuxt 4/Nitro, TypeScript strict, Zod 4, Supabase CLI/PostgreSQL/Auth, `@supabase/supabase-js`, pgTAP, Vitest, Playwright

## Global Constraints

- Keep `ssr: false` and the mock repository as the default until the Company/Project HTTP repository plan.
- Use Node.js 24.x and pnpm 10.29.3.
- SQL migrations are the only schema source of truth; do not add an ORM.
- Never expose or use Supabase `service_role` in the browser or normal request path.
- Derive `tenantId` from authenticated membership; never trust a client tenant ID.
- Put `tenant_id` and `company_id` plus RLS on every shared business table.
- Keep Nitro handlers thin and domain services framework-neutral.
- Preserve `RepositoryRegistry`, current routes, fixtures, and E2E behavior.
- Use Vietnamese public messages and stable English error codes.
- Follow TDD: failing test, observed failure, minimal implementation, passing test, focused commit.

---

## Scope

The approved architecture is split into independently testable plans:

1. **This plan:** Supabase local, Auth verification, membership schema/RLS, request context, session and company-context APIs.
2. Company/Project read repositories.
3. Task/workflow mutations and audit.
4. Drawing/media private storage.
5. Production hardening.

This phase does not add a login page, switch `repositories.client.ts` to HTTP, or remove local storage. It delivers a backend that authenticates a JWT, lists the caller's companies, resolves company context without accepting a tenant ID, and passes two-tenant SQL isolation tests.

## File map

**Modify:** `package.json`, `pnpm-lock.yaml`, `nuxt.config.ts`, `README.md`.

**Create — platform:** `.env.example`, `supabase/config.toml`, `supabase/migrations/20260814000100_create_tenancy_foundation.sql`, `supabase/seed.sql`, `supabase/tests/database/tenancy_schema.test.sql`, `supabase/tests/database/tenancy_rls.test.sql`, `shared/types/database.types.ts`.

**Create — server:** `server/utils/supabase-config.ts`, `request-id.ts`, `api-error.ts`, `supabase-client.ts`, `auth-context.ts`, `server/features/tenancy/tenancy.service.ts`, request middleware, health/session/company-context routes, and `server/types/h3.d.ts`.

**Create — contracts/tests/docs:** `shared/schemas/api-error.ts`, `shared/schemas/session.ts`, focused tests under `tests/unit/server/`, and `docs/development/backend-cloud-dev.md`.

---

### Task 1: Local Supabase tooling and runtime configuration

**Files:**
- Modify: `package.json:6`
- Modify: `nuxt.config.ts:1`
- Create: `.env.example`
- Create: `supabase/config.toml` via CLI
- Create: `server/utils/supabase-config.ts`
- Test: `tests/unit/server/supabase-config.spec.ts`

**Interfaces:**
- Produces: `SupabaseRuntimeConfig = { url: string; anonKey: string }`
- Produces: `parseSupabaseRuntimeConfig(input: unknown): SupabaseRuntimeConfig`

- [ ] **Step 1: Install and initialize Supabase**

~~~powershell
pnpm add @supabase/supabase-js
pnpm add -D supabase
pnpm exec supabase init
~~~

Expected: dependencies and lockfile change; `supabase/config.toml` exists; Docker services are not started yet.

- [ ] **Step 2: Add package scripts**

~~~json
"supabase:start": "supabase start",
"supabase:stop": "supabase stop",
"db:reset": "supabase db reset",
"db:test": "supabase test db",
"db:types": "supabase gen types typescript --local > shared/types/database.types.ts"
~~~

- [ ] **Step 3: Write the failing config test**

Create `tests/unit/server/supabase-config.spec.ts`:

~~~ts
import { describe, expect, it } from 'vitest'
import { parseSupabaseRuntimeConfig } from '../../../server/utils/supabase-config'

describe('parseSupabaseRuntimeConfig', () => {
  it('accepts valid values', () => {
    expect(parseSupabaseRuntimeConfig({
      url: 'http://127.0.0.1:54321',
      anonKey: 'local-anon-key',
    })).toEqual({
      url: 'http://127.0.0.1:54321',
      anonKey: 'local-anon-key',
    })
  })

  it.each([
    [{ url: '', anonKey: 'key' }, 'SUPABASE_URL_INVALID'],
    [{ url: 'not-a-url', anonKey: 'key' }, 'SUPABASE_URL_INVALID'],
    [{ url: 'http://127.0.0.1:54321', anonKey: '' }, 'SUPABASE_ANON_KEY_MISSING'],
  ])('rejects invalid values %#', (input, code) => {
    expect(() => parseSupabaseRuntimeConfig(input)).toThrow(code)
  })
})
~~~

- [ ] **Step 4: Observe the failure**

Run: `pnpm exec vitest run tests/unit/server/supabase-config.spec.ts`

Expected: FAIL because the implementation file is missing.

- [ ] **Step 5: Implement the parser**

Create `server/utils/supabase-config.ts`:

~~~ts
import { z } from 'zod'

export interface SupabaseRuntimeConfig {
  url: string
  anonKey: string
}

const schema = z.object({ url: z.string(), anonKey: z.string() })

export function parseSupabaseRuntimeConfig(input: unknown): SupabaseRuntimeConfig {
  const parsed = schema.parse(input)
  if (!z.string().url().safeParse(parsed.url).success) {
    throw new Error('SUPABASE_URL_INVALID')
  }
  if (parsed.anonKey.length === 0) {
    throw new Error('SUPABASE_ANON_KEY_MISSING')
  }
  return parsed
}
~~~

- [ ] **Step 6: Add public runtime values**

Create `.env.example`:

~~~dotenv
NUXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NUXT_PUBLIC_SUPABASE_ANON_KEY=replace-with-local-anon-key-from-supabase-status
~~~

Add to `nuxt.config.ts`:

~~~ts
runtimeConfig: {
  public: {
    supabaseUrl: process.env.NUXT_PUBLIC_SUPABASE_URL ?? '',
    supabaseAnonKey: process.env.NUXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  },
},
~~~

- [ ] **Step 7: Verify and commit**

~~~powershell
pnpm exec vitest run tests/unit/server/supabase-config.spec.ts
pnpm typecheck
rg -n "SERVICE_ROLE|serviceRole|service_role" app server nuxt.config.ts .env.example
git add package.json pnpm-lock.yaml nuxt.config.ts .env.example supabase/config.toml server/utils/supabase-config.ts tests/unit/server/supabase-config.spec.ts
git commit -m "build: add local Supabase foundation"
~~~

Expected: test/typecheck PASS; `rg` has no matches; commit succeeds.

---

### Task 2: Tenant, company, membership, and audit schema

**Files:**
- Create: `supabase/migrations/20260814000100_create_tenancy_foundation.sql`
- Create: `supabase/seed.sql`
- Create: `supabase/tests/database/tenancy_schema.test.sql`
- Generate: `shared/types/database.types.ts`

**Interfaces:**
- Tables: `tenants`, `companies`, `tenant_memberships`, `company_memberships`, `audit_events`
- Functions: `is_tenant_member(uuid)` and `is_company_member(uuid, uuid)`

- [ ] **Step 1: Write the failing schema contract**

Create `supabase/tests/database/tenancy_schema.test.sql`:

~~~sql
begin;
select plan(10);
select has_table('public', 'tenants', 'tenants exists');
select has_table('public', 'companies', 'companies exists');
select has_table('public', 'tenant_memberships', 'tenant memberships exists');
select has_table('public', 'company_memberships', 'company memberships exists');
select has_table('public', 'audit_events', 'audit events exists');
select has_column('public', 'companies', 'tenant_id', 'company has tenant scope');
select has_column('public', 'company_memberships', 'company_id', 'membership has company scope');
select has_column('public', 'audit_events', 'request_id', 'audit has request ID');
select has_function('public', 'is_tenant_member', array['uuid'], 'tenant helper exists');
select has_function('public', 'is_company_member', array['uuid', 'uuid'], 'company helper exists');
select * from finish();
rollback;
~~~

- [ ] **Step 2: Start Supabase and observe failure**

~~~powershell
pnpm supabase:start
pnpm db:test
~~~

Expected: FAIL because the schema is absent.

- [ ] **Step 3: Add the migration**

Create `supabase/migrations/20260814000100_create_tenancy_foundation.sql`:

~~~sql
create type public.deployment_mode as enum ('shared', 'dedicated');

create table public.tenants (
  id uuid primary key,
  code text not null unique,
  name text not null,
  deployment_mode public.deployment_mode not null default 'shared',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.companies (
  id uuid primary key,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  code text not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code),
  unique (id, tenant_id)
);

create table public.tenant_memberships (
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  roles text[] not null check (cardinality(roles) > 0),
  created_at timestamptz not null default now(),
  primary key (user_id, tenant_id)
);

create table public.company_memberships (
  user_id uuid not null,
  tenant_id uuid not null,
  company_id uuid not null,
  roles text[] not null check (cardinality(roles) > 0),
  created_at timestamptz not null default now(),
  primary key (user_id, company_id),
  foreign key (user_id, tenant_id)
    references public.tenant_memberships(user_id, tenant_id) on delete cascade,
  foreign key (company_id, tenant_id)
    references public.companies(id, tenant_id) on delete cascade
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  tenant_id uuid not null,
  company_id uuid not null,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  resource_type text not null,
  resource_id text not null,
  request_id uuid not null,
  before_summary jsonb,
  after_summary jsonb,
  created_at timestamptz not null default now(),
  foreign key (company_id, tenant_id)
    references public.companies(id, tenant_id) on delete restrict
);

create index tenant_memberships_tenant_user_idx
  on public.tenant_memberships (tenant_id, user_id);
create index company_memberships_scope_user_idx
  on public.company_memberships (tenant_id, company_id, user_id);
create index audit_events_scope_created_idx
  on public.audit_events (tenant_id, company_id, created_at desc);

create function public.is_tenant_member(target_tenant_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.tenant_memberships m
    where m.user_id = (select auth.uid())
      and m.tenant_id = target_tenant_id
  );
$$;

create function public.is_company_member(target_tenant_id uuid, target_company_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.company_memberships m
    where m.user_id = (select auth.uid())
      and m.tenant_id = target_tenant_id
      and m.company_id = target_company_id
  );
$$;

revoke all on function public.is_tenant_member(uuid) from public;
revoke all on function public.is_company_member(uuid, uuid) from public;
grant execute on function public.is_tenant_member(uuid) to authenticated;
grant execute on function public.is_company_member(uuid, uuid) to authenticated;

alter table public.tenants enable row level security;
alter table public.companies enable row level security;
alter table public.tenant_memberships enable row level security;
alter table public.company_memberships enable row level security;
alter table public.audit_events enable row level security;

create policy tenants_select_member on public.tenants
for select to authenticated using (public.is_tenant_member(id));
create policy companies_select_member on public.companies
for select to authenticated using (public.is_company_member(tenant_id, id));
create policy tenant_memberships_select_self on public.tenant_memberships
for select to authenticated using (user_id = (select auth.uid()));
create policy company_memberships_select_self on public.company_memberships
for select to authenticated using (user_id = (select auth.uid()));
create policy audit_events_select_company_member on public.audit_events
for select to authenticated using (public.is_company_member(tenant_id, company_id));

grant select on public.tenants, public.companies, public.tenant_memberships,
  public.company_memberships, public.audit_events to authenticated;
~~~

- [ ] **Step 4: Add deterministic seed data**

Create `supabase/seed.sql`:

~~~sql
insert into auth.users (id, email) values
  ('10000000-0000-4000-8000-000000000001', 'owner@vqh.local'),
  ('20000000-0000-4000-8000-000000000001', 'owner@isolation.local')
on conflict (id) do nothing;

insert into public.tenants (id, code, name) values
  ('10000000-0000-4000-8000-000000000010', 'vqh', 'Việt Quốc Huy'),
  ('20000000-0000-4000-8000-000000000010', 'isolation', 'Tenant kiểm thử cách ly');

insert into public.companies (id, tenant_id, code, name) values
  ('10000000-0000-4000-8000-000000000020', '10000000-0000-4000-8000-000000000010', 'VQH', 'Việt Quốc Huy'),
  ('20000000-0000-4000-8000-000000000020', '20000000-0000-4000-8000-000000000010', 'ISO', 'Công ty kiểm thử cách ly');

insert into public.tenant_memberships (user_id, tenant_id, roles) values
  ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000010', array['tenant_admin']),
  ('20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000010', array['tenant_admin']);

insert into public.company_memberships (user_id, tenant_id, company_id, roles) values
  ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000020', array['director']),
  ('20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-000000000020', array['director']);
~~~

- [ ] **Step 5: Reset, test, and generate types**

~~~powershell
pnpm db:reset
pnpm db:test
New-Item -ItemType Directory -Force shared\types
pnpm db:types
pnpm typecheck
~~~

Expected: 10 pgTAP assertions PASS; generated types contain five tables and two functions; typecheck PASS.

- [ ] **Step 6: Commit**

~~~powershell
git add supabase/migrations/20260814000100_create_tenancy_foundation.sql supabase/seed.sql supabase/tests/database/tenancy_schema.test.sql shared/types/database.types.ts
git commit -m "feat: add tenant membership schema"
~~~

---

### Task 3: Prove cross-tenant isolation with pgTAP

**Files:**
- Create: `supabase/tests/database/tenancy_rls.test.sql`

**Interfaces:**
- Consumes deterministic UUIDs from Task 2.
- Verifies user-scoped reads, cross-tenant invisibility, and read-only direct table access.

- [ ] **Step 1: Write the RLS test**

Create `supabase/tests/database/tenancy_rls.test.sql`:

~~~sql
begin;
select plan(8);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select results_eq(
  $$select code from public.tenants order by code$$,
  array['vqh']::text[],
  'VQH user sees only the VQH tenant'
);
select results_eq(
  $$select code from public.companies order by code$$,
  array['VQH']::text[],
  'VQH user sees only the VQH company'
);
select results_eq(
  $$select tenant_id::text from public.tenant_memberships$$,
  array['10000000-0000-4000-8000-000000000010']::text[],
  'VQH user sees only their tenant membership'
);
select results_eq(
  $$select company_id::text from public.company_memberships$$,
  array['10000000-0000-4000-8000-000000000020']::text[],
  'VQH user sees only their company membership'
);
select is_empty(
  $$select id from public.companies
    where id = '20000000-0000-4000-8000-000000000020'$$,
  'VQH user cannot infer the isolation company'
);
select throws_ok(
  $$insert into public.companies (id, tenant_id, code, name)
    values (
      '10000000-0000-4000-8000-000000000099',
      '10000000-0000-4000-8000-000000000010',
      'NOPE',
      'Direct insert'
    )$$,
  'authenticated users cannot write tenancy tables directly'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select results_eq(
  $$select code from public.companies order by code$$,
  array['ISO']::text[],
  'isolation user sees only the isolation company'
);
select is_empty(
  $$select id from public.companies
    where id = '10000000-0000-4000-8000-000000000020'$$,
  'isolation user cannot infer the VQH company'
);

select * from finish();
rollback;
~~~

- [ ] **Step 2: Prove the test detects an open policy**

Temporarily change `companies_select_member` in the migration from:

~~~sql
using (public.is_company_member(tenant_id, id));
~~~

to:

~~~sql
using (true);
~~~

Run: `pnpm db:reset; pnpm db:test`

Expected: FAIL because each user can see the other company.

- [ ] **Step 3: Restore the policy and prove green**

Restore `using (public.is_company_member(tenant_id, id));`, then run:

~~~powershell
pnpm db:reset
pnpm db:test
~~~

Expected: both SQL files PASS with 18 assertions and zero failures.

- [ ] **Step 4: Commit**

~~~powershell
git add supabase/tests/database/tenancy_rls.test.sql
git commit -m "test: prove tenant isolation policies"
~~~

---

### Task 4: Request IDs and stable API errors

**Files:**
- Create: `shared/schemas/api-error.ts`
- Create: `server/utils/request-id.ts`
- Create: `server/utils/api-error.ts`
- Create: `server/middleware/request-id.ts`
- Create: `server/types/h3.d.ts`
- Create: `server/api/health.get.ts`
- Test: `tests/unit/server/request-id.spec.ts`
- Test: `tests/unit/server/api-error.spec.ts`

**Interfaces:**
- Produces `ApiErrorCode`, `ApiErrorBody`, `AppApiError`.
- Produces `ensureRequestId(candidate, createId)` and `runApiRoute(event, handler)`.
- Adds `event.context.requestId`.

- [ ] **Step 1: Write failing tests**

Create `tests/unit/server/request-id.spec.ts`:

~~~ts
import { describe, expect, it, vi } from 'vitest'
import { ensureRequestId } from '../../../server/utils/request-id'

describe('ensureRequestId', () => {
  it('keeps a valid UUID', () => {
    const id = '10000000-0000-4000-8000-000000000001'
    expect(ensureRequestId(id, vi.fn())).toBe(id)
  })

  it('replaces an invalid value', () => {
    const createId = vi.fn(() => '30000000-0000-4000-8000-000000000001')
    expect(ensureRequestId('invalid', createId))
      .toBe('30000000-0000-4000-8000-000000000001')
    expect(createId).toHaveBeenCalledOnce()
  })
})
~~~

Create `tests/unit/server/api-error.spec.ts`:

~~~ts
import { describe, expect, it } from 'vitest'
import { AppApiError, toApiErrorBody } from '../../../server/utils/api-error'

describe('toApiErrorBody', () => {
  it('maps an expected error', () => {
    const error = new AppApiError(403, 'COMPANY_FORBIDDEN', 'Bạn không có quyền truy cập công ty này.')
    expect(toApiErrorBody(error, 'request-id')).toEqual({
      error: {
        code: 'COMPANY_FORBIDDEN',
        message: 'Bạn không có quyền truy cập công ty này.',
        requestId: 'request-id',
        details: {},
      },
    })
  })

  it('does not leak unknown errors', () => {
    expect(toApiErrorBody(new Error('secret'), 'request-id')).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Hệ thống gặp lỗi ngoài dự kiến.',
        requestId: 'request-id',
        details: {},
      },
    })
  })
})
~~~

- [ ] **Step 2: Observe failure**

Run: `pnpm exec vitest run tests/unit/server/request-id.spec.ts tests/unit/server/api-error.spec.ts`

Expected: FAIL because both utilities are missing.

- [ ] **Step 3: Define the shared error contract**

Create `shared/schemas/api-error.ts`:

~~~ts
import { z } from 'zod'

export const apiErrorCodeSchema = z.enum([
  'AUTH_REQUIRED',
  'AUTH_INVALID',
  'COMPANY_CONTEXT_REQUIRED',
  'COMPANY_FORBIDDEN',
  'INTERNAL_ERROR',
])
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>

export const apiErrorBodySchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string().min(1),
    requestId: z.string().min(1),
    details: z.record(z.string(), z.unknown()),
  }),
})
export type ApiErrorBody = z.infer<typeof apiErrorBodySchema>
~~~

- [ ] **Step 4: Implement request and error helpers**

Create `server/utils/request-id.ts`:

~~~ts
import { z } from 'zod'

const uuidSchema = z.string().uuid()

export function ensureRequestId(
  candidate: string | undefined,
  createId: () => string = crypto.randomUUID,
): string {
  return candidate && uuidSchema.safeParse(candidate).success ? candidate : createId()
}
~~~

Create `server/utils/api-error.ts`:

~~~ts
import type { H3Event } from 'h3'
import { createError } from 'h3'
import type { ApiErrorBody, ApiErrorCode } from '../../shared/schemas/api-error'

export class AppApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message)
  }
}

export function toApiErrorBody(error: unknown, requestId: string): ApiErrorBody {
  if (error instanceof AppApiError) {
    return {
      error: {
        code: error.code,
        message: error.message,
        requestId,
        details: error.details,
      },
    }
  }
  return {
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Hệ thống gặp lỗi ngoài dự kiến.',
      requestId,
      details: {},
    },
  }
}

export async function runApiRoute<T>(
  event: H3Event,
  handler: () => Promise<T>,
): Promise<T> {
  try {
    return await handler()
  } catch (error) {
    const body = toApiErrorBody(error, event.context.requestId)
    throw createError({
      statusCode: error instanceof AppApiError ? error.statusCode : 500,
      statusMessage: body.error.code,
      data: body,
    })
  }
}
~~~

- [ ] **Step 5: Add typed middleware and health**

Create `server/types/h3.d.ts`:

~~~ts
declare module 'h3' {
  interface H3EventContext {
    requestId: string
  }
}
export {}
~~~

Create `server/middleware/request-id.ts`:

~~~ts
import { getHeader, setResponseHeader } from 'h3'
import { ensureRequestId } from '../utils/request-id'

export default defineEventHandler((event) => {
  const requestId = ensureRequestId(getHeader(event, 'x-request-id'))
  event.context.requestId = requestId
  setResponseHeader(event, 'x-request-id', requestId)
})
~~~

Create `server/api/health.get.ts`:

~~~ts
export default defineEventHandler(event => ({
  status: 'ok' as const,
  requestId: event.context.requestId,
}))
~~~

- [ ] **Step 6: Verify and commit**

~~~powershell
pnpm exec vitest run tests/unit/server/request-id.spec.ts tests/unit/server/api-error.spec.ts
pnpm typecheck
pnpm lint
git add shared/schemas/api-error.ts server/utils/request-id.ts server/utils/api-error.ts server/middleware/request-id.ts server/types/h3.d.ts server/api/health.get.ts tests/unit/server/request-id.spec.ts tests/unit/server/api-error.spec.ts
git commit -m "feat: add backend request boundary"
~~~

Expected: focused tests, typecheck, and lint PASS; commit succeeds.

---

### Task 5: Bearer authentication and user-scoped clients

**Files:**
- Create: `server/utils/supabase-client.ts`
- Create: `server/utils/auth-context.ts`
- Test: `tests/unit/server/auth-context.spec.ts`

**Interfaces:**
- Produces `AuthenticatedActor = { userId; email; accessToken }`.
- Produces `authenticateBearer(authorization, verifier)`.
- Produces `requireAuthenticatedRequest(event): Promise<{ actor; db }>`.
- Guarantees `db` carries the verified user's JWT and anon key, never service-role.

- [ ] **Step 1: Write the failing auth tests**

Create `tests/unit/server/auth-context.spec.ts`:

~~~ts
import { describe, expect, it, vi } from 'vitest'
import { authenticateBearer } from '../../../server/utils/auth-context'

describe('authenticateBearer', () => {
  it('rejects a missing token', async () => {
    await expect(authenticateBearer(undefined, { getUser: vi.fn() }))
      .rejects.toMatchObject({ statusCode: 401, code: 'AUTH_REQUIRED' })
  })

  it('rejects an invalid token', async () => {
    const getUser = vi.fn().mockResolvedValue({
      data: { user: null },
      error: new Error('invalid'),
    })
    await expect(authenticateBearer('Bearer invalid', { getUser }))
      .rejects.toMatchObject({ statusCode: 401, code: 'AUTH_INVALID' })
  })

  it('returns the verified actor and token', async () => {
    const getUser = vi.fn().mockResolvedValue({
      data: { user: { id: 'user-1', email: 'owner@vqh.local' } },
      error: null,
    })
    await expect(authenticateBearer('Bearer signed-token', { getUser }))
      .resolves.toEqual({
        userId: 'user-1',
        email: 'owner@vqh.local',
        accessToken: 'signed-token',
      })
  })
})
~~~

- [ ] **Step 2: Observe failure**

Run: `pnpm exec vitest run tests/unit/server/auth-context.spec.ts`

Expected: FAIL because `auth-context.ts` is missing.

- [ ] **Step 3: Implement Supabase client factories**

Create `server/utils/supabase-client.ts`:

~~~ts
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../shared/types/database.types'
import type { SupabaseRuntimeConfig } from './supabase-config'

const auth = {
  autoRefreshToken: false,
  detectSessionInUrl: false,
  persistSession: false,
} as const

export function createSupabaseAnonClient(config: SupabaseRuntimeConfig) {
  return createClient<Database>(config.url, config.anonKey, { auth })
}

export function createSupabaseUserClient(
  config: SupabaseRuntimeConfig,
  accessToken: string,
) {
  return createClient<Database>(config.url, config.anonKey, {
    auth,
    global: { headers: { Authorization: 'Bearer ' + accessToken } },
  })
}

export type UserSupabaseClient = ReturnType<typeof createSupabaseUserClient>
~~~

- [ ] **Step 4: Implement pure authentication and Nitro adapter**

Create `server/utils/auth-context.ts`:

~~~ts
import type { H3Event } from 'h3'
import { getHeader } from 'h3'
import { AppApiError } from './api-error'
import { parseSupabaseRuntimeConfig } from './supabase-config'
import { createSupabaseAnonClient, createSupabaseUserClient } from './supabase-client'

interface VerifiedUser { id: string; email?: string }
export interface UserVerifier {
  getUser(token: string): Promise<{
    data: { user: VerifiedUser | null }
    error: Error | null
  }>
}
export interface AuthenticatedActor {
  userId: string
  email: string | null
  accessToken: string
}

function bearerToken(value: string | undefined): string {
  const match = value?.match(/^Bearer ([^\s]+)$/)
  if (!match) {
    throw new AppApiError(401, 'AUTH_REQUIRED', 'Bạn cần đăng nhập để tiếp tục.')
  }
  return match[1]
}

export async function authenticateBearer(
  authorization: string | undefined,
  verifier: UserVerifier,
): Promise<AuthenticatedActor> {
  const accessToken = bearerToken(authorization)
  const { data, error } = await verifier.getUser(accessToken)
  if (error || !data.user) {
    throw new AppApiError(401, 'AUTH_INVALID', 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.')
  }
  return {
    userId: data.user.id,
    email: data.user.email ?? null,
    accessToken,
  }
}

export async function requireAuthenticatedRequest(event: H3Event) {
  const runtime = useRuntimeConfig(event)
  const config = parseSupabaseRuntimeConfig({
    url: runtime.public.supabaseUrl,
    anonKey: runtime.public.supabaseAnonKey,
  })
  const anon = createSupabaseAnonClient(config)
  const actor = await authenticateBearer(getHeader(event, 'authorization'), {
    getUser: token => anon.auth.getUser(token),
  })
  return {
    actor,
    db: createSupabaseUserClient(config, actor.accessToken),
  }
}
~~~

- [ ] **Step 5: Verify the security boundary and commit**

~~~powershell
pnpm exec vitest run tests/unit/server/auth-context.spec.ts
pnpm typecheck
pnpm lint
rg -n "service_role|SERVICE_ROLE|serviceRole" server app nuxt.config.ts
git add server/utils/supabase-client.ts server/utils/auth-context.ts tests/unit/server/auth-context.spec.ts
git commit -m "feat: authenticate backend requests"
~~~

Expected: tests/static checks PASS; `rg` has no matches; commit succeeds.

---

### Task 6: Trusted company context and authenticated APIs

**Files:**
- Create: `shared/schemas/session.ts`
- Create: `server/features/tenancy/tenancy.service.ts`
- Create: `server/api/auth/session.get.ts`
- Create: `server/api/companies/[companyId]/context.get.ts`
- Test: `tests/unit/server/tenancy.service.spec.ts`

**Interfaces:**
- Produces `CompanyAccess` and `CompanyRequestContext`.
- Produces `createTenancyService(reader)` with `listCompanies` and `resolveCompanyContext`.
- HTTP: `GET /api/auth/session` and `GET /api/companies/:companyId/context`.
- Neither service nor route accepts a client `tenantId`.

- [ ] **Step 1: Write failing service tests**

Create `tests/unit/server/tenancy.service.spec.ts`:

~~~ts
import { describe, expect, it, vi } from 'vitest'
import { createTenancyService } from '../../../server/features/tenancy/tenancy.service'

const vqh = {
  tenantId: '10000000-0000-4000-8000-000000000010',
  companyId: '10000000-0000-4000-8000-000000000020',
  companyCode: 'VQH',
  companyName: 'Việt Quốc Huy',
  roles: ['director'],
}

describe('tenancy service', () => {
  it('lists access for the authenticated user', async () => {
    const reader = {
      listCompanyAccess: vi.fn().mockResolvedValue([vqh]),
      findCompanyAccess: vi.fn(),
    }
    await expect(createTenancyService(reader).listCompanies('user-vqh'))
      .resolves.toEqual([vqh])
    expect(reader.listCompanyAccess).toHaveBeenCalledWith('user-vqh')
  })

  it('derives tenant context from company membership', async () => {
    const reader = {
      listCompanyAccess: vi.fn(),
      findCompanyAccess: vi.fn().mockResolvedValue(vqh),
    }
    await expect(createTenancyService(reader).resolveCompanyContext(
      'user-vqh',
      vqh.companyId,
    )).resolves.toEqual({
      tenantId: vqh.tenantId,
      companyId: vqh.companyId,
      roles: ['director'],
    })
  })

  it('uses the same forbidden result for absent and cross-tenant companies', async () => {
    const reader = {
      listCompanyAccess: vi.fn(),
      findCompanyAccess: vi.fn().mockResolvedValue(null),
    }
    await expect(createTenancyService(reader).resolveCompanyContext('user-vqh', 'other'))
      .rejects.toMatchObject({ statusCode: 403, code: 'COMPANY_FORBIDDEN' })
  })
})
~~~

- [ ] **Step 2: Observe failure**

Run: `pnpm exec vitest run tests/unit/server/tenancy.service.spec.ts`

Expected: FAIL because the tenancy service is missing.

- [ ] **Step 3: Define shared response schemas**

Create `shared/schemas/session.ts`:

~~~ts
import { z } from 'zod'

export const companyAccessSchema = z.object({
  tenantId: z.string().uuid(),
  companyId: z.string().uuid(),
  companyCode: z.string().min(1),
  companyName: z.string().min(1),
  roles: z.array(z.string().min(1)).min(1),
})
export type CompanyAccess = z.infer<typeof companyAccessSchema>

export const sessionResponseSchema = z.object({
  user: z.object({
    id: z.string().min(1),
    email: z.string().email().nullable(),
  }),
  companies: z.array(companyAccessSchema),
})

export const companyRequestContextSchema = companyAccessSchema.pick({
  tenantId: true,
  companyId: true,
  roles: true,
})
export type CompanyRequestContext = z.infer<typeof companyRequestContextSchema>
~~~

- [ ] **Step 4: Implement service and Supabase reader**

Create `server/features/tenancy/tenancy.service.ts`:

~~~ts
import type { CompanyAccess, CompanyRequestContext } from '../../../shared/schemas/session'
import { AppApiError } from '../../utils/api-error'
import type { UserSupabaseClient } from '../../utils/supabase-client'

export interface TenancyReader {
  listCompanyAccess(userId: string): Promise<CompanyAccess[]>
  findCompanyAccess(userId: string, companyId: string): Promise<CompanyAccess | null>
}

export function createTenancyService(reader: TenancyReader) {
  return {
    listCompanies(userId: string) {
      return reader.listCompanyAccess(userId)
    },
    async resolveCompanyContext(
      userId: string,
      companyId: string,
    ): Promise<CompanyRequestContext> {
      const membership = await reader.findCompanyAccess(userId, companyId)
      if (!membership) {
        throw new AppApiError(
          403,
          'COMPANY_FORBIDDEN',
          'Bạn không có quyền truy cập công ty này.',
        )
      }
      return {
        tenantId: membership.tenantId,
        companyId: membership.companyId,
        roles: membership.roles,
      }
    },
  }
}

interface MembershipRow {
  tenant_id: string
  company_id: string
  roles: string[]
  companies: { code: string; name: string } | Array<{ code: string; name: string }>
}

function mapMembership(row: MembershipRow): CompanyAccess {
  const company = Array.isArray(row.companies) ? row.companies[0] : row.companies
  if (!company) {
    throw new AppApiError(500, 'INTERNAL_ERROR', 'Không thể đọc thông tin công ty.')
  }
  return {
    tenantId: row.tenant_id,
    companyId: row.company_id,
    companyCode: company.code,
    companyName: company.name,
    roles: row.roles,
  }
}

export function createSupabaseTenancyReader(db: UserSupabaseClient): TenancyReader {
  async function query(userId: string, companyId?: string): Promise<CompanyAccess[]> {
    let request = db
      .from('company_memberships')
      .select('tenant_id, company_id, roles, companies!inner(code, name)')
      .eq('user_id', userId)
      .order('company_id')
    if (companyId) request = request.eq('company_id', companyId)

    const { data, error } = await request
    if (error) {
      throw new AppApiError(500, 'INTERNAL_ERROR', 'Không thể đọc danh sách công ty.')
    }
    return (data as unknown as MembershipRow[]).map(mapMembership)
  }

  return {
    listCompanyAccess: userId => query(userId),
    async findCompanyAccess(userId, companyId) {
      return (await query(userId, companyId))[0] ?? null
    },
  }
}
~~~

- [ ] **Step 5: Add thin authenticated routes**

Create `server/api/auth/session.get.ts`:

~~~ts
import { sessionResponseSchema } from '../../../shared/schemas/session'
import { createSupabaseTenancyReader, createTenancyService } from '../../features/tenancy/tenancy.service'
import { runApiRoute } from '../../utils/api-error'
import { requireAuthenticatedRequest } from '../../utils/auth-context'

export default defineEventHandler(event => runApiRoute(event, async () => {
  const { actor, db } = await requireAuthenticatedRequest(event)
  const service = createTenancyService(createSupabaseTenancyReader(db))
  return sessionResponseSchema.parse({
    user: { id: actor.userId, email: actor.email },
    companies: await service.listCompanies(actor.userId),
  })
}))
~~~

Create `server/api/companies/[companyId]/context.get.ts`:

~~~ts
import { getRouterParam } from 'h3'
import { companyRequestContextSchema } from '../../../../shared/schemas/session'
import { createSupabaseTenancyReader, createTenancyService } from '../../../features/tenancy/tenancy.service'
import { AppApiError, runApiRoute } from '../../../utils/api-error'
import { requireAuthenticatedRequest } from '../../../utils/auth-context'

export default defineEventHandler(event => runApiRoute(event, async () => {
  const companyId = getRouterParam(event, 'companyId')
  if (!companyId) {
    throw new AppApiError(
      400,
      'COMPANY_CONTEXT_REQUIRED',
      'Bạn cần chọn công ty để tiếp tục.',
    )
  }
  const { actor, db } = await requireAuthenticatedRequest(event)
  const service = createTenancyService(createSupabaseTenancyReader(db))
  return companyRequestContextSchema.parse(
    await service.resolveCompanyContext(actor.userId, companyId),
  )
}))
~~~

- [ ] **Step 6: Verify and commit**

~~~powershell
pnpm exec vitest run tests/unit/server/tenancy.service.spec.ts
pnpm db:test
pnpm typecheck
pnpm lint
git add shared/schemas/session.ts server/features/tenancy/tenancy.service.ts server/api/auth/session.get.ts "server/api/companies/[companyId]/context.get.ts" tests/unit/server/tenancy.service.spec.ts
git commit -m "feat: resolve authenticated company context"
~~~

Expected: all checks PASS; the service accepts only user and company IDs; commit succeeds.

---

### Task 7: Runbook and full phase verification

**Files:**
- Modify: `package.json`
- Modify: `README.md`
- Create: `docs/development/backend-cloud-dev.md`

**Interfaces:**
- Produces `pnpm verify:backend` as the release gate.

- [ ] **Step 1: Add the release-gate script**

~~~json
"verify:backend": "pnpm db:reset && pnpm db:test && pnpm db:types && pnpm test:unit && pnpm typecheck && pnpm lint && pnpm build"
~~~

- [ ] **Step 2: Write the local runbook**

Create `docs/development/backend-cloud-dev.md`:

~~~~markdown
# Local backend development

## Prerequisites

- Node.js 24.x
- pnpm 10.29.3
- Docker Desktop running

## First startup

~~~powershell
pnpm install
pnpm supabase:start
Copy-Item .env.example .env
pnpm db:reset
pnpm db:types
pnpm dev
~~~

Copy the API URL and anon key printed by `pnpm exec supabase status` into `.env`.

## Database workflow

~~~powershell
pnpm exec supabase migration new descriptive_name
pnpm db:reset
pnpm db:test
pnpm db:types
~~~

Never edit `shared/types/database.types.ts` manually.

## Verification

~~~powershell
pnpm verify:backend
git diff --exit-code -- shared/types/database.types.ts
~~~

## Shutdown

~~~powershell
pnpm supabase:stop
~~~

The frontend remains on mock repositories in this phase. The next plan consumes the authenticated session and company-context APIs.
~~~~

- [ ] **Step 3: Link the runbook**

Add under `## Cài đặt và chạy` in `README.md`:

~~~markdown
Backend local cần Docker Desktop và Supabase CLI. Xem [Cloud DEV backend development](../../development/backend-cloud-dev.md) để khởi động, reset migration, chạy RLS test và generate database types.
~~~

- [ ] **Step 4: Run the backend release gate**

~~~powershell
pnpm supabase:start
pnpm verify:backend
git diff --exit-code -- shared/types/database.types.ts
~~~

Expected: reset succeeds; pgTAP has 18 assertions and zero failures; Vitest, typecheck, lint, and production build PASS; generated types are clean.

- [ ] **Step 5: Run existing browser regression**

Run: `pnpm test:e2e`

Expected: all current Playwright tests PASS because the app still uses mock repositories and has no auth gate.

- [ ] **Step 6: Verify security invariants**

~~~powershell
rg -n "SERVICE_ROLE|serviceRole|service_role" app server nuxt.config.ts .env.example
rg -n "tenantId|tenant_id" server/api
~~~

Expected: the first command has no matches. The second finds no client tenant-ID input; any occurrence is response/context mapping.

- [ ] **Step 7: Commit documentation**

~~~powershell
git add package.json README.md docs/development/backend-cloud-dev.md
git commit -m "docs: add backend development workflow"
~~~

## Phase completion checklist

- [ ] Database reset reconstructs schema and both tenant fixtures.
- [ ] RLS tests prove each user sees only their tenant/company.
- [ ] `GET /api/health` is public and returns a request ID.
- [ ] Protected routes return stable 401 codes for missing/invalid tokens.
- [ ] `GET /api/auth/session` returns only RLS-visible companies.
- [ ] Company context derives `tenantId` from membership and hides cross-tenant existence.
- [ ] Normal request-path files contain no service-role credentials.
- [ ] Existing mock repository and browser tests remain passing.
- [ ] Generated database types are committed and reproducible.
- [ ] The worktree is clean after the final commit.

## Next plan

After this phase passes review, create `docs/superpowers/plans/2026-08-14-company-project-http-repositories.md` for the production data-source flag, login/session UI, `CompanyRepository` and `ProjectRepository` HTTP adapters, shared contract tests, and controlled VQH read-path rollout.
