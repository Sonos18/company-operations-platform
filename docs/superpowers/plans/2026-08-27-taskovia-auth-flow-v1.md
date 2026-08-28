# Taskovia Auth Flow v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver an invite-only, persistent and permission-aware Taskovia authentication vertical slice backed by Supabase Auth and the existing Taskovia app-session API.

**Architecture:** Nuxt UI and global middleware use two Pinia stores. Stores orchestrate a frontend auth service; the service calls a Supabase Auth repository and a typed Nitro session repository. Nitro delegates app-session composition to a backend service that reuses existing tenancy and authorization services.

**Tech Stack:** Nuxt 4 SPA, Vue 3, Pinia, `@pinia/nuxt`, Supabase JS v2, Zod 4, Nitro/H3, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-27-taskovia-auth-flow-v1-design.md`

## Global constraints

- Base implementation on fetched `origin/main`, analyzed at `aa11e8bb0267bbf63ef6564083e4561a088afdf0`.
- Use branch `feat/taskovia-auth-flow-v1`.
- Do not create a worktree.
- Follow root `AGENTS.md`.
- Use TDD for behavior changes.
- Do not migrate mock business repositories.
- Do not add database migrations.
- Do not put password or token values in source, test fixtures, logs or reports.
- Browser talks directly to Supabase Auth for credential flows.
- Nitro remains the authority for app session, company membership and permission context.
- Invite/recovery callback must use `token_hash + verifyOtp`; do not use access-token fragments or invitation PKCE exchange.
- Password policy is 12–72 characters, passphrase-friendly, no composition rule and no trimming.
- Production and billing changes are forbidden.
- Cloud DEV mutation is limited to the approved Auth config fields in Task 11.

---

## File map

### Shared contracts

- Create `shared/schemas/auth.ts` — form schemas, callback query schema and auth-flow types.
- Create `shared/utils/app-url.ts` — canonical app URL parser and callback builder.
- Modify `shared/schemas/api-error.ts` only if a stable backend code is truly required; prefer client-only codes for provider/network failures.

### Frontend boundary

- Create `app/errors/client-error.ts`
- Create `app/errors/auth-error-mapper.ts`
- Create `app/repositories/auth/supabase-auth.repository.ts`
- Create `app/repositories/http/authenticated-http-client.ts`
- Create `app/repositories/http/http-session-repository.ts`
- Create `app/services/auth/auth.service.ts`
- Create `app/services/auth/access-policy.ts`
- Create `app/services/auth/active-company.storage.ts`
- Create `app/services/auth/recovery-flow.storage.ts`
- Create `app/stores/auth/auth.store.ts`
- Create `app/stores/company/company-access.store.ts`
- Create `app/plugins/supabase.client.ts`
- Create `app/plugins/auth-lifecycle.client.ts`
- Create `app/middleware/access.global.ts`
- Create `app/types/page-meta.d.ts`

### UI

- Create `app/layouts/auth.vue`
- Create focused components under `app/components/auth/**`
- Create `/login`, `/forgot-password`, `/auth/callback`, `/reset-password`, `/select-company`, `/no-access`, `/forbidden`
- Modify `app/app.vue`, `app/layouts/default.vue`, `AppHeader.vue`, `AppSidebar.vue`
- Add page metadata to existing business pages

### Backend and email

- Create `server/features/auth/session.service.ts`
- Modify `server/api/auth/session.get.ts`
- Modify `server/utils/supabase-client.ts`
- Modify `server/features/employees/employee-invitation-auth.ts`
- Modify `server/features/employees/employee.routes.ts`
- Create `supabase/templates/invite.html`
- Create `supabase/templates/recovery.html`
- Modify `supabase/config.toml`

### Configuration and docs

- Modify `package.json`, `pnpm-lock.yaml`, `nuxt.config.ts`, `.env.example`
- Create `docs/runbooks/auth-flow.md`
- Update relevant backend/deployment docs only where the Auth flow requires exact callback or Cloud DEV settings.

### Tests

- Add focused unit specs under `tests/unit/auth/**`
- Add backend session/invite specs under `tests/unit/server/**`
- Add `tests/e2e/auth.setup.ts`
- Add `tests/e2e/fixtures/authenticated.ts`
- Add `tests/e2e/auth-flow.spec.ts`
- Update existing E2E imports to use the authenticated fixture
- Modify `playwright.config.ts`

---

### Task 1: Persist approved artifacts and add Pinia/runtime configuration

**Files:**
- Create: `docs/superpowers/specs/2026-08-27-taskovia-auth-flow-v1-design.md`
- Create: `docs/superpowers/plans/2026-08-27-taskovia-auth-flow-v1.md`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `nuxt.config.ts`
- Modify: `.env.example`
- Test: `tests/unit/config/auth-runtime-config.spec.ts`

**Interfaces:**
- Produces public runtime keys `appUrl`, `supabaseUrl`, `supabaseAnonKey`.
- Produces Pinia store auto-import from `app/stores/**`.

- [ ] **Step 1: Write failing configuration tests**

Assert:

```ts
expect(packageJson.dependencies).toHaveProperty('pinia')
expect(packageJson.dependencies).toHaveProperty('@pinia/nuxt')
expect(nuxtConfig).toContain("'@pinia/nuxt'")
expect(nuxtConfig).toContain("storesDirs: ['./app/stores/**']")
expect(envExample).toContain('NUXT_PUBLIC_APP_URL=http://127.0.0.1:3000')
```

- [ ] **Step 2: Run the focused test**

```bash
pnpm vitest run tests/unit/config/auth-runtime-config.spec.ts
```

Expected: FAIL because Pinia and app URL are absent.

- [ ] **Step 3: Install dependencies**

```bash
pnpm add pinia @pinia/nuxt
```

- [ ] **Step 4: Configure Nuxt**

Add `@pinia/nuxt`, explicit `storesDirs`, and `runtimeConfig.public.appUrl`.

- [ ] **Step 5: Add the canonical local app URL**

Add:

```dotenv
NUXT_PUBLIC_APP_URL=http://127.0.0.1:3000
```

Do not add secrets.

- [ ] **Step 6: Run focused and baseline validation**

```bash
pnpm vitest run tests/unit/config/auth-runtime-config.spec.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml nuxt.config.ts .env.example \
  tests/unit/config/auth-runtime-config.spec.ts \
  docs/superpowers/specs/2026-08-27-taskovia-auth-flow-v1-design.md \
  docs/superpowers/plans/2026-08-27-taskovia-auth-flow-v1.md
git commit -m "chore: add Taskovia auth foundation"
```

---

### Task 2: Add shared Auth schemas, canonical URL and redirect safety

**Files:**
- Create: `shared/schemas/auth.ts`
- Create: `shared/utils/app-url.ts`
- Create: `app/services/auth/access-policy.ts`
- Test: `tests/unit/auth/auth-schemas.spec.ts`
- Test: `tests/unit/auth/app-url.spec.ts`
- Test: `tests/unit/auth/access-policy.spec.ts`

**Interfaces:**
- Produces:
  - `signInInputSchema`
  - `forgotPasswordInputSchema`
  - `resetPasswordInputSchema`
  - `authCallbackQuerySchema`
  - `AuthEmailFlow = 'invite' | 'recovery'`
  - `parseCanonicalAppUrl(value: string): URL`
  - `buildAuthCallbackUrl(appUrl: string): string`
  - `sanitizeInternalRedirect(value: unknown): string | null`
  - `resolveAccessNavigation(input): AccessDecision`

- [ ] **Step 1: Write failing schema tests**

Include exact cases:

```ts
expect(signInInputSchema.parse({
  email: '  USER@example.com ',
  password: ' old password ',
})).toEqual({
  email: 'user@example.com',
  password: ' old password ',
})
```

Reset-password assertions:

```ts
expect(resetPasswordInputSchema.safeParse({
  password: 'twelve chars',
  confirmation: 'twelve chars',
}).success).toBe(true)

expect(resetPasswordInputSchema.safeParse({
  password: ' '.repeat(12),
  confirmation: ' '.repeat(12),
}).success).toBe(false)

expect(resetPasswordInputSchema.safeParse({
  password: 'a'.repeat(73),
  confirmation: 'a'.repeat(73),
}).success).toBe(false)
```

- [ ] **Step 2: Write failing callback/URL tests**

Verify only `invite|recovery`, exact callback pathname, HTTPS except local hosts, and no query/fragment/credentials.

- [ ] **Step 3: Write failing redirect/access-policy tests**

Reject:

```text
//evil.example
https://evil.example
javascript:...
/login as a post-login redirect
```

Test anonymous, recovery, no-company, select-company and permission-denied decisions.

- [ ] **Step 4: Run tests and verify RED**

```bash
pnpm vitest run tests/unit/auth/auth-schemas.spec.ts \
  tests/unit/auth/app-url.spec.ts \
  tests/unit/auth/access-policy.spec.ts
```

- [ ] **Step 5: Implement minimal pure contracts**

Keep these files framework-independent and side-effect free.

- [ ] **Step 6: Run tests and verify GREEN**

Use the same command; expect PASS.

- [ ] **Step 7: Commit**

```bash
git add shared/schemas/auth.ts shared/utils/app-url.ts \
  app/services/auth/access-policy.ts tests/unit/auth
git commit -m "feat: define Taskovia auth contracts"
```

---

### Task 3: Implement stable frontend errors and Supabase Auth repository

**Files:**
- Create: `app/errors/client-error.ts`
- Create: `app/errors/auth-error-mapper.ts`
- Create: `app/repositories/auth/supabase-auth.repository.ts`
- Create: `app/plugins/supabase.client.ts`
- Test: `tests/unit/auth/client-error.spec.ts`
- Test: `tests/unit/auth/supabase-auth-repository.spec.ts`

**Interfaces:**

```ts
export interface SupabaseAuthRepository {
  signIn(input: SignInInput): Promise<void>
  signOut(): Promise<void>
  getAccessToken(): Promise<string | null>
  refreshSession(): Promise<void>
  requestPasswordReset(input: { email: string; redirectTo: string }): Promise<void>
  verifyEmailTokenHash(input: { tokenHash: string; type: AuthEmailFlow }): Promise<void>
  updatePassword(password: string): Promise<void>
  subscribe(listener: (event: AuthLifecycleEvent) => void): () => void
}
```

- [ ] **Step 1: Write error-mapping tests**

Test invalid credentials, rate limit, weak password with reason `pwned`, weak password for policy mismatch, network failure and unexpected provider errors.

- [ ] **Step 2: Write repository contract tests with a narrow fake Supabase client**

Assert:

- email normalized, password unchanged;
- `resetPasswordForEmail` receives exact callback;
- callback uses `verifyOtp({ token_hash, type })`;
- no `exchangeCodeForSession`;
- no raw provider error escapes;
- subscription returns an unsubscribe function.

- [ ] **Step 3: Run tests and verify RED**

```bash
pnpm vitest run tests/unit/auth/client-error.spec.ts \
  tests/unit/auth/supabase-auth-repository.spec.ts
```

- [ ] **Step 4: Implement `ClientError`**

Use the approved shape and stable codes. Preserve Nitro `requestId` when present.

- [ ] **Step 5: Implement the browser client plugin**

Use:

```ts
auth: {
  flowType: 'pkce',
  persistSession: true,
  autoRefreshToken: true,
  detectSessionInUrl: false,
}
```

Provide one client/repository instance.

- [ ] **Step 6: Implement the repository**

Do not log tokens, provider errors or response bodies.

- [ ] **Step 7: Run tests and typecheck**

```bash
pnpm vitest run tests/unit/auth/client-error.spec.ts \
  tests/unit/auth/supabase-auth-repository.spec.ts
pnpm typecheck
```

- [ ] **Step 8: Commit**

```bash
git add app/errors app/repositories/auth app/plugins/supabase.client.ts \
  tests/unit/auth/client-error.spec.ts \
  tests/unit/auth/supabase-auth-repository.spec.ts
git commit -m "feat: add Supabase auth repository"
```

---

### Task 4: Version email templates and propagate the Taskovia invite callback

**Files:**
- Create: `supabase/templates/invite.html`
- Create: `supabase/templates/recovery.html`
- Modify: `supabase/config.toml`
- Modify: `server/utils/supabase-client.ts`
- Modify: `server/features/employees/employee-invitation-auth.ts`
- Modify: `server/features/employees/employee.routes.ts`
- Test: `tests/unit/config/auth-email-templates.spec.ts`
- Test: `tests/unit/server/service-role-boundary.spec.ts`
- Test: `tests/unit/server/employee.service.spec.ts`

**Interfaces:**
- `createSupabaseInvitationAuthAdmin(client, { redirectTo })`
- Domain service can retain `inviteUser(email)`; the adapter closes over the approved redirect URL.

- [ ] **Step 1: Write failing template/config tests**

Assert:

```text
enable_signup = false
auth.email.enable_signup = false
minimum_password_length = 12
password_requirements = ""
additional_redirect_urls contains exact HTTP callback
invite template uses TokenHash + type=invite
recovery template uses TokenHash + type=recovery
neither template uses access_token or refresh_token
```

- [ ] **Step 2: Write failing invitation adapter tests**

Assert `inviteUserByEmail` receives:

```ts
{
  redirectTo: 'http://127.0.0.1:3000/auth/callback',
}
```

and the service-role key remains server-only.

- [ ] **Step 3: Run focused tests and verify RED**

```bash
pnpm vitest run tests/unit/config/auth-email-templates.spec.ts \
  tests/unit/server/service-role-boundary.spec.ts \
  tests/unit/server/employee.service.spec.ts
```

- [ ] **Step 4: Add templates and local Auth config**

Use exact, accessible Taskovia-branded links. Do not add scripts or inline JavaScript to email HTML.

- [ ] **Step 5: Add redirect-aware invitation adapter**

Parse `runtime.public.appUrl`, build the callback URL, and close it into the Admin adapter.

- [ ] **Step 6: Run tests and verify GREEN**

Use the same focused command.

- [ ] **Step 7: Commit**

```bash
git add supabase/config.toml supabase/templates \
  server/utils/supabase-client.ts \
  server/features/employees/employee-invitation-auth.ts \
  server/features/employees/employee.routes.ts \
  tests/unit/config/auth-email-templates.spec.ts \
  tests/unit/server/service-role-boundary.spec.ts \
  tests/unit/server/employee.service.spec.ts
git commit -m "feat: route Taskovia auth emails safely"
```

---

### Task 5: Extract the backend app-session service

**Files:**
- Create: `server/features/auth/session.service.ts`
- Modify: `server/api/auth/session.get.ts`
- Test: `tests/unit/server/auth-session.service.spec.ts`
- Test: `tests/unit/server/auth-session-route.spec.ts`

**Interfaces:**

```ts
export interface AppSessionCompanyReader {
  listCompanies(userId: string): Promise<CompanyAccess[]>
}

export function createAuthSessionService(reader: AppSessionCompanyReader) {
  return {
    getSession(actor: { userId: string; email: string | null }): Promise<SessionResponse>
  }
}
```

- [ ] **Step 1: Write failing service tests**

Verify exact user/company response and schema rejection of malformed company access.

- [ ] **Step 2: Write failing thin-route tests**

Verify the route authenticates once, constructs the service from existing tenancy/authorization readers, and contains no business composition logic.

- [ ] **Step 3: Run tests and verify RED**

```bash
pnpm vitest run tests/unit/server/auth-session.service.spec.ts \
  tests/unit/server/auth-session-route.spec.ts
```

- [ ] **Step 4: Implement the service and refactor route**

Reuse `createTenancyService`, `createSupabaseTenancyReader` and `createSupabaseAuthorizationReader`.

- [ ] **Step 5: Run tests and verify GREEN**

Use the same command.

- [ ] **Step 6: Commit**

```bash
git add server/features/auth/session.service.ts \
  server/api/auth/session.get.ts \
  tests/unit/server/auth-session.service.spec.ts \
  tests/unit/server/auth-session-route.spec.ts
git commit -m "refactor: extract auth session service"
```

---

### Task 6: Add the authenticated HTTP client and app-session repository

**Files:**
- Create: `app/repositories/http/authenticated-http-client.ts`
- Create: `app/repositories/http/http-session-repository.ts`
- Test: `tests/unit/auth/authenticated-http-client.spec.ts`
- Test: `tests/unit/auth/http-session-repository.spec.ts`

**Interfaces:**

```ts
export interface AuthenticatedHttpClient {
  request<T>(input: {
    url: string
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
    schema: z.ZodType<T>
    body?: unknown
  }): Promise<T>
}

export interface SessionRepository {
  get(): Promise<SessionResponse>
}
```

- [ ] **Step 1: Write failing HTTP tests**

Cover missing token, Bearer header, stable error envelope, `requestId`, malformed JSON, malformed success schema, 401/403/429/500 and network failure.

- [ ] **Step 2: Run tests and verify RED**

```bash
pnpm vitest run tests/unit/auth/authenticated-http-client.spec.ts \
  tests/unit/auth/http-session-repository.spec.ts
```

- [ ] **Step 3: Implement the HTTP client**

Always resolve the access token at request time. Never capture a token at client construction.

- [ ] **Step 4: Implement the session repository**

Call only:

```text
GET /api/auth/session
```

and parse with `sessionResponseSchema`.

- [ ] **Step 5: Run tests and verify GREEN**

Use the same command.

- [ ] **Step 6: Commit**

```bash
git add app/repositories/http/authenticated-http-client.ts \
  app/repositories/http/http-session-repository.ts \
  tests/unit/auth/authenticated-http-client.spec.ts \
  tests/unit/auth/http-session-repository.spec.ts
git commit -m "feat: add authenticated session gateway"
```

---

### Task 7: Implement recovery/active-company storage, frontend service and Pinia stores

**Files:**
- Create: `app/services/auth/active-company.storage.ts`
- Create: `app/services/auth/recovery-flow.storage.ts`
- Create: `app/services/auth/auth.service.ts`
- Create: `app/stores/auth/auth.store.ts`
- Create: `app/stores/company/company-access.store.ts`
- Test: `tests/unit/auth/auth.service.spec.ts`
- Test: `tests/unit/auth/auth.store.spec.ts`
- Test: `tests/unit/auth/company-access.store.spec.ts`
- Test: `tests/unit/auth/recovery-flow.storage.spec.ts`

**Interfaces:**

```ts
export interface AuthService {
  restoreAppSession(): Promise<SessionResponse | null>
  signIn(input: SignInInput): Promise<SessionResponse>
  requestPasswordReset(input: ForgotPasswordInput): Promise<void>
  completeEmailCallback(input: AuthCallbackInput): Promise<void>
  completePasswordReset(input: ResetPasswordInput): Promise<SessionResponse>
  refreshAppSession(): Promise<SessionResponse>
  signOut(): Promise<void>
}
```

- [ ] **Step 1: Write failing storage tests**

Verify per-user active-company key, invalid stored company rejection, recovery marker 15-minute expiry and no secret fields.

- [ ] **Step 2: Write failing service tests**

Cover:

- login validation before repository;
- callback marker set before/after verification as specified;
- reset clears marker/password inputs;
- app-session network failure;
- one refresh and one retry for `AUTH_INVALID`;
- no mutation retry;
- generic forgot-password outcome.

- [ ] **Step 3: Write failing store tests**

Use `setActivePinia(createPinia())`. Test lifecycle transitions, operation-specific loading/error state, logout cleanup, zero/one/many company resolution, permission helpers and no token persistence.

- [ ] **Step 4: Run tests and verify RED**

```bash
pnpm vitest run tests/unit/auth/auth.service.spec.ts \
  tests/unit/auth/auth.store.spec.ts \
  tests/unit/auth/company-access.store.spec.ts \
  tests/unit/auth/recovery-flow.storage.spec.ts
```

- [ ] **Step 5: Implement storage helpers**

Use localStorage only for active company and sessionStorage only for the non-secret recovery marker.

- [ ] **Step 6: Implement service and stores**

Use single-flight for initialization/app-session refresh. Keep raw session/token out of Pinia state.

- [ ] **Step 7: Run tests and verify GREEN**

Use the same command, then:

```bash
pnpm typecheck
```

- [ ] **Step 8: Commit**

```bash
git add app/services/auth app/stores tests/unit/auth
git commit -m "feat: manage Taskovia auth state"
```

---

### Task 8: Add lifecycle bootstrap and fail-closed global middleware

**Files:**
- Create: `app/plugins/auth-lifecycle.client.ts`
- Create: `app/middleware/access.global.ts`
- Create: `app/types/page-meta.d.ts`
- Modify: `app/app.vue`
- Test: `tests/unit/auth/auth-lifecycle.spec.ts`
- Test: `tests/unit/auth/access-middleware.spec.ts`

**Interfaces:**
- Middleware delegates navigation decisions to `resolveAccessNavigation`.
- Lifecycle plugin registers exactly one Auth listener and one throttled visibility listener.

- [ ] **Step 1: Write failing lifecycle tests**

Test listener cleanup, recovery-lock suppression, relevant Auth events, single-flight and visibility throttling.

- [ ] **Step 2: Write failing middleware tests**

Test all route modes, default protection, no-company, select-company, forbidden and internal redirect sanitization.

- [ ] **Step 3: Run tests and verify RED**

```bash
pnpm vitest run tests/unit/auth/auth-lifecycle.spec.ts \
  tests/unit/auth/access-middleware.spec.ts
```

- [ ] **Step 4: Implement plugin and middleware**

Do not render protected content while bootstrapping. `connection_error` renders only Retry/Logout.

- [ ] **Step 5: Add PageMeta typing**

Include exact permission types from `shared/constants/permissions.ts`.

- [ ] **Step 6: Run tests and verify GREEN**

Use the same command and `pnpm typecheck`.

- [ ] **Step 7: Commit**

```bash
git add app/plugins/auth-lifecycle.client.ts app/middleware/access.global.ts \
  app/types/page-meta.d.ts app/app.vue tests/unit/auth
git commit -m "feat: guard Taskovia routes"
```

---

### Task 9: Build Taskovia Auth and access-state UI

**Files:**
- Create: `app/layouts/auth.vue`
- Create: `app/components/auth/AuthFormAlert.vue`
- Create: `app/components/auth/PasswordField.vue`
- Create: `app/components/auth/LoginForm.vue`
- Create: `app/components/auth/ForgotPasswordForm.vue`
- Create: `app/components/auth/ResetPasswordForm.vue`
- Create: `app/components/auth/ConnectionErrorState.vue`
- Create: `app/pages/login.vue`
- Create: `app/pages/forgot-password.vue`
- Create: `app/pages/auth/callback.vue`
- Create: `app/pages/reset-password.vue`
- Create: `app/pages/select-company.vue`
- Create: `app/pages/no-access.vue`
- Create: `app/pages/forbidden.vue`

- [ ] **Step 1: Add page metadata first**

Each page declares its approved `authMode`, `requiresCompany` and auth layout.

- [ ] **Step 2: Implement accessible form components**

Field errors use `aria-describedby`; form errors use `role="alert"`; focus the first invalid field; preserve email but clear passwords.

- [ ] **Step 3: Implement callback page**

Validate query, call the store/service, replace browser history with `/reset-password`, and never render token values.

- [ ] **Step 4: Implement access-state pages**

Provide only approved actions: retry, logout, company selection, return to `/projects`.

- [ ] **Step 5: Run local quality gates**

```bash
pnpm typecheck
pnpm lint
pnpm build
```

- [ ] **Step 6: Commit**

```bash
git add app/layouts/auth.vue app/components/auth app/pages
git commit -m "feat: add Taskovia auth screens"
```

---

### Task 10: Integrate authenticated shell, company switcher and permission-aware navigation

**Files:**
- Modify: `app/layouts/default.vue`
- Modify: `app/components/app/AppHeader.vue`
- Modify: `app/components/app/AppSidebar.vue`
- Modify: existing business pages under `app/pages/**`
- Test: `tests/unit/auth/navigation-permissions.spec.ts`

**Interfaces:**
- Header receives authenticated identity and `CompanyAccess[]`.
- Sidebar links declare required permission(s), then filter through company store helpers.

- [ ] **Step 1: Write failing navigation tests**

Verify project, task, employee and drawing links against the canonical permissions.

- [ ] **Step 2: Run test and verify RED**

```bash
pnpm vitest run tests/unit/auth/navigation-permissions.spec.ts
```

- [ ] **Step 3: Replace mock company identity in the shell**

Use active company from Pinia for shell identity. Do not alter the business repository plugin.

- [ ] **Step 4: Add real user identity, logout and company switching**

Fallback to email and derived initials. Show switcher only for multiple companies.

- [ ] **Step 5: Add exact permission page metadata**

Annotate all existing business pages without changing their business data behavior.

- [ ] **Step 6: Run focused and application validation**

```bash
pnpm vitest run tests/unit/auth/navigation-permissions.spec.ts
pnpm verify:app
```

- [ ] **Step 7: Commit**

```bash
git add app/layouts/default.vue app/components/app app/pages \
  tests/unit/auth/navigation-permissions.spec.ts
git commit -m "feat: integrate authenticated app shell"
```

---

### Task 11: Build deterministic Playwright Auth fixtures and protect the existing E2E suite

**Files:**
- Create: `tests/e2e/auth.setup.ts`
- Create: `tests/e2e/fixtures/authenticated.ts`
- Create: `tests/e2e/auth-flow.spec.ts`
- Modify: `playwright.config.ts`
- Modify: existing `tests/e2e/*.spec.ts` imports

**Interfaces:**
- Auth setup signs in through the real UI against intercepted Supabase endpoints, then writes an authenticated storage state.
- Existing prototype specs use the authenticated fixture.
- Auth-flow specs use the base anonymous fixture.

- [ ] **Step 1: Add a failing anonymous route test**

```ts
await page.goto('/projects')
await expect(page).toHaveURL(/\/login\?redirect=%2Fprojects/)
```

- [ ] **Step 2: Add controlled Supabase/Nitro interceptors**

Intercept only the external Auth endpoints and `/api/auth/session`. Use fake, non-secret tokens and the full canonical 34-permission company response.

- [ ] **Step 3: Add setup project and storage state**

Configure Playwright dependencies so normal specs start authenticated. Set `NUXT_PUBLIC_APP_URL` to the dynamic Playwright base URL through `webServer.env`.

- [ ] **Step 4: Update existing E2E imports**

Change:

```ts
import { expect, test } from '@playwright/test'
```

to the authenticated fixture where the spec expects application access.

- [ ] **Step 5: Add Auth v1 E2E coverage**

Cover login, invalid credentials, persistence, logout, generic forgot response, token-hash callback, reset, no-access, multi-company selection/switching, forbidden and connection error.

- [ ] **Step 6: Run Auth E2E and verify GREEN**

```bash
pnpm playwright test tests/e2e/auth-flow.spec.ts
```

- [ ] **Step 7: Run the complete E2E suite**

```bash
pnpm test:e2e
```

Expected: all existing prototype behavior remains green under the authenticated fixture.

- [ ] **Step 8: Commit**

```bash
git add playwright.config.ts tests/e2e
git commit -m "test: cover Taskovia auth flow"
```

---

### Task 12: Apply and verify Taskovia Cloud DEV Auth configuration

**Target:** `gtgljlnhwvhqdnwrfdfj`

**Side effect class:** `cloud_dev_mutating`

**Authorized fields only:**

```text
site_url
uri_allow_list
disable_signup
password_min_length
password_required_characters
mailer_subjects_invite
mailer_subjects_recovery
mailer_templates_invite_content
mailer_templates_recovery_content
password_hibp_enabled when supported
```

- [ ] **Step 1: Re-run guarded target preflight**

```bash
pnpm db:dev:auth-check
pnpm db:dev:target
pnpm db:dev:status
pnpm db:dev:dry-run
```

Expected: exact Taskovia project and zero migration drift.

- [ ] **Step 2: Read current hosted Auth config without printing secrets**

Use the dedicated authorized Management API token. Store no response containing secrets in Git.

- [ ] **Step 3: Prepare a minimal PATCH**

Set:

```json
{
  "site_url": "http://127.0.0.1:3000",
  "uri_allow_list": "http://127.0.0.1:3000/auth/callback",
  "disable_signup": true,
  "password_min_length": 12,
  "password_required_characters": "",
  "mailer_subjects_invite": "Bạn được mời vào Taskovia",
  "mailer_subjects_recovery": "Đặt lại mật khẩu Taskovia"
}
```

Add the exact committed invite/recovery HTML. Set `password_hibp_enabled: true` only when the current plan supports it.

- [ ] **Step 4: Apply through a one-time guarded script**

The script must:

- assert project ref before PATCH;
- strip ambient credentials;
- use only the authorized PAT;
- log only field names and pass/fail;
- never print templates with token values, PAT or API keys;
- be removed before commit.

- [ ] **Step 5: Read back and compare exact fields**

If HIBP is unsupported, record the plan limitation and leave billing unchanged.

- [ ] **Step 6: Re-run database read-only checks**

```bash
pnpm db:dev:status
pnpm db:dev:dry-run
pnpm db:dev:canonical-check
pnpm db:dev:rls-smoke
pnpm db:dev:advisors:security
```

Auth config changes must not create database drift.

---

### Task 13: Documentation, live smoke, full verification and delivery

**Files:**
- Create: `docs/runbooks/auth-flow.md`
- Modify: `README.md`
- Modify: relevant Cloud DEV/deployment docs only as required

- [ ] **Step 1: Document operator flows**

Cover invite, forgot/reset, callback URL, local env, Cloud DEV Auth config, runtime-only smoke credentials, logout and common error codes.

- [ ] **Step 2: Run fresh full validation**

```bash
pnpm test:unit
pnpm typecheck
pnpm lint
pnpm build
pnpm test:e2e
git diff --check
```

- [ ] **Step 3: Run a live Cloud DEV smoke**

Supply email/password only at runtime. Verify sanitized output:

```text
email matches runtime account
companyCode = VQH
roles includes company_admin
permissionCount = 34
```

Do not print or persist the access token or password.

- [ ] **Step 4: Run security-focused self-review**

Review every changed file for:

- token/password leakage;
- open redirect;
- callback replay/incorrect type;
- unauthorized signup;
- stale permission rendering;
- auth-event races;
- retrying mutations;
- service-role exposure;
- Cloud DEV/Production confusion.

- [ ] **Step 5: Confirm scope**

No migration, seed, business mock repository, employee record, OAuth, signup UI, MFA or Production change.

- [ ] **Step 6: Commit documentation/final fixes**

```bash
git add README.md docs app server shared tests package.json pnpm-lock.yaml nuxt.config.ts \
  .env.example supabase/config.toml supabase/templates
git commit -m "docs: add Taskovia auth runbook"
```

Skip the commit if there are no remaining tracked changes.

- [ ] **Step 7: Refetch and verify base drift**

Review `execution_base_sha..HEAD` and current `origin/main`. Stop with `PACKET_STALE` if material Auth drift appeared.

- [ ] **Step 8: Push and verify remote**

```bash
git push -u origin feat/taskovia-auth-flow-v1
git ls-remote --heads origin feat/taskovia-auth-flow-v1
```

Only report `COMPLETE` when remote HEAD equals local HEAD.

---

## Plan self-review

- Spec coverage: all approved Auth, company context, permission, error, callback, password, Cloud DEV and scope requirements map to Tasks 1–13.
- Completeness scan: no unresolved markers or deferred implementation steps.
- Type consistency: repository, service and store interfaces are named once and consumed consistently.
- Scope: no business-data migration or employee-profile work is included.

---
