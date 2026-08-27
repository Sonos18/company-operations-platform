# Taskovia Auth Flow v1 — Approved Design

**Status:** `APPROVED_WITH_TECHNICAL_CONFORMANCE`  
**Approved by:** Sơn  
**Repository:** `Sonos18/company-operations-platform`  
**Base ref:** `origin/main`  
**Analysis base SHA:** `aa11e8bb0267bbf63ef6564083e4561a088afdf0`  
**Approved scope version:** `taskovia-auth-flow-v1`

## 1. Technical conformance amendments

The approved product behavior is unchanged. Two implementation details are corrected so the design matches the actual Supabase Auth contract.

1. **Invite/recovery callback**
   - Admin email invitations are cross-device flows and cannot rely on the inviter's PKCE verifier.
   - Taskovia must use versioned invite/recovery templates containing `TokenHash`.
   - The email opens `/auth/callback?token_hash=...&type=invite|recovery`.
   - The browser exchanges the token hash with `supabase.auth.verifyOtp`.
   - Taskovia must not use access/refresh-token URL fragments, `exchangeCodeForSession` for invitation acceptance, or an implicit session fragment.

2. **Password maximum**
   - Taskovia keeps the approved minimum of 12 characters and passphrase-friendly rules.
   - The maximum is **72 characters**, not 128, because Supabase Auth's bcrypt-backed password contract rejects values above 72 characters.
   - Password input is never trimmed. Whitespace is allowed, but whitespace-only passwords are rejected.

These are provider-conformance corrections, not changes to product scope.

---

## 2. Goal

Build a complete invite-only authentication vertical slice:

```text
Invite/recovery email
→ secure callback
→ set/reset password
→ email/password sign-in
→ persistent Supabase session
→ verified Taskovia app session
→ company/role/permission context
→ protected and permission-aware application
→ logout
```

Supabase Auth owns credentials, password hashing, access/refresh tokens, persistence, refresh, invitation and recovery verification.

Taskovia Nitro owns Bearer-token verification, application session, company membership, normalized roles, permissions and business API authorization.

Passwords never transit through a Taskovia Nitro endpoint.

---

## 3. Scope

### In scope

- `pinia` and `@pinia/nuxt`
- One browser Supabase Auth client
- Invite-only email/password sign-in
- Persistent session and refresh
- Logout
- Forgot password
- Invite/recovery callback using token hash verification
- Set/reset password
- `GET /api/auth/session`
- User identity, company access, active company, roles and permissions
- Default-protected global route middleware
- Permission-aware route and navigation behavior
- `/login`
- `/forgot-password`
- `/auth/callback`
- `/reset-password`
- `/select-company`
- `/no-access`
- `/forbidden`
- Taskovia-branded auth layout
- Company switcher and authenticated identity in the header
- Validation before external calls
- Stable frontend error contract for Supabase, Nitro, network and malformed responses
- Backend auth-session service
- Unit and Playwright E2E coverage
- Versioned local invite/recovery email templates
- Taskovia Cloud DEV Auth URL, invite-only and password configuration
- Leaked Password Protection in Cloud DEV when the current plan supports it

### Out of scope

- Public signup
- OAuth/social login
- Magic-link login
- MFA
- Migration of projects/tasks/drawings/journey from mock repositories
- Changes to mock business repository behavior
- Creating an employee record for an Auth identity
- A second-company business-data design
- Production deployment or Production Auth configuration
- Billing/plan changes
- Deleting the retired VQH Supabase project
- Database migrations

---

## 4. Architecture

```text
Page / component / route middleware
                  ↓
             Pinia stores
                  ↓
        Frontend auth service
                  ↓
     Repository / gateway boundary
          ↙                   ↘
Supabase Auth            Taskovia Nitro
                              ↓
                  Backend auth-session service
                              ↓
               Tenancy + authorization services
                              ↓
                    PostgreSQL + RLS
```

### Responsibility rules

| Layer | Owns |
| --- | --- |
| UI | Input, focus, loading, field/form messages |
| Middleware | Auth, company and permission navigation decisions |
| Pinia | Reactive application state and use-case orchestration |
| Frontend service | Multi-repository auth workflows |
| Repository/gateway | External calls, schema parsing and error mapping |
| Nitro route | HTTP boundary and stable API envelope |
| Backend service | Build the Taskovia app-session DTO |
| Tenancy/authorization | Membership, active roles and permissions |
| Supabase/Postgres | Auth authority, RLS and canonical data |

Pages, components and Pinia stores must not contain raw `$fetch` or raw Supabase calls.

---

## 5. Dependencies and configuration

Install:

```text
pinia
@pinia/nuxt
```

Do not install a Pinia persistence plugin for Auth.

Add public runtime configuration:

```text
NUXT_PUBLIC_APP_URL
NUXT_PUBLIC_SUPABASE_URL
NUXT_PUBLIC_SUPABASE_ANON_KEY
```

`NUXT_PUBLIC_APP_URL` is the canonical application origin. It must:

- be an absolute URL;
- have no credentials, query or fragment;
- use HTTPS except for `localhost` or `127.0.0.1`;
- be used to build the exact `/auth/callback` URL;
- never be derived from an untrusted request Host header.

Pinia store discovery must explicitly cover `app/stores/**`.

---

## 6. Browser Supabase Auth client

Create exactly one client with:

```ts
{
  auth: {
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
}
```

Email callback handling is explicit through `verifyOtp`; `detectSessionInUrl` remains disabled so Taskovia never accepts an implicit access-token fragment.

The Auth repository owns:

```text
signInWithPassword
signOut
getSession
refreshSession
resetPasswordForEmail
verifyOtp(token_hash, invite|recovery)
updateUser({ password })
onAuthStateChange
```

The client is not a database repository for business data.

---

## 7. Email invitation and recovery

Commit versioned templates:

```text
supabase/templates/invite.html
supabase/templates/recovery.html
```

The invite template links to:

```text
{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=invite
```

The recovery template links to:

```text
{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery
```

Both links use the exact callback URL supplied by Taskovia.

Future employee invitations must call:

```ts
inviteUserByEmail(email, {
  redirectTo: buildAuthCallbackUrl(appUrl),
})
```

Forgot-password requests must call:

```ts
resetPasswordForEmail(email, {
  redirectTo: buildAuthCallbackUrl(appUrl),
})
```

The hosted Taskovia Cloud DEV email templates must match the committed templates.

---

## 8. Callback and recovery lock

`/auth/callback` accepts only:

```text
token_hash
type = invite | recovery
```

It must:

1. validate the query;
2. enter a recovery lock before exchanging the token;
3. call `verifyOtp({ token_hash, type })`;
4. remove the sensitive query from browser history immediately;
5. persist only a short-lived, non-secret recovery marker containing flow type and timestamp;
6. redirect to `/reset-password`.

The recovery marker:

- contains no token, password, email or user ID;
- is stored in `sessionStorage`, not localStorage;
- expires after 15 minutes;
- is cleared after password update, logout or callback failure.

While the recovery lock exists, `SIGNED_IN` or token events must not redirect to the normal application before the new password is set.

`/reset-password` requires both a valid Supabase session and a valid recovery marker.

---

## 9. Pinia stores

### Auth store

Runtime state:

```ts
type AuthLifecycle =
  | 'idle'
  | 'bootstrapping'
  | 'anonymous'
  | 'authenticated'
  | 'connection_error'
  | 'recovery'

interface AuthUser {
  id: string
  email: string | null
}

interface OperationState {
  status: 'idle' | 'pending' | 'success' | 'error'
  error: ClientError | null
}
```

Actions:

```text
initialize
signIn
signOut
requestPasswordReset
completeEmailCallback
completePasswordReset
refreshAppSession
retryConnection
handleAuthStateChange
```

The store must not persist a raw Supabase session, access token, refresh token, password or provider error.

### Company-access store

State:

```text
companies
activeCompanyId
activeCompany
roles
permissions
```

Persist only:

```text
taskovia:active-company:<user-id> = <company-id>
```

The persisted ID is accepted only if it appears in the latest app-session response.

---

## 10. Application session

`GET /api/auth/session` remains the only Taskovia app-session endpoint.

The backend route must delegate its use case to `server/features/auth/session.service.ts`.

The service returns:

```ts
{
  user: {
    id: string
    email: string | null
  }
  companies: Array<{
    tenantId: string
    companyId: string
    companyCode: string
    companyName: string
    roles: string[]
    permissions: PermissionCode[]
  }>
}
```

The route still verifies the Bearer token through Supabase Auth and creates a user-scoped database client so RLS remains authoritative.

No login, logout, forgot-password or reset-password Nitro endpoints are added.

---

## 11. Active company

```text
0 companies → /no-access
1 company   → auto-select
N companies → restore the last valid selection, otherwise /select-company
```

Switching company:

- never logs the user out;
- replaces roles and permissions with those in the selected company entry;
- clears company-scoped runtime state;
- redirects to `/projects`.

Only the company ID is persisted. Company data, roles and permissions are always refreshed from `/api/auth/session`.

---

## 12. Route and permission policy

A global middleware is named with Nuxt's `.global.ts` convention.

Custom route metadata:

```ts
interface PageMeta {
  authMode?: 'public' | 'guest' | 'recovery' | 'authenticated'
  requiresCompany?: boolean
  requiredPermission?: PermissionCode
  requiredAnyPermissions?: PermissionCode[]
}
```

Defaults:

```text
authMode = authenticated
requiresCompany = true
```

Route matrix:

| Route | Auth mode | Company |
| --- | --- | --- |
| `/login` | guest | no |
| `/forgot-password` | guest | no |
| `/auth/callback` | recovery | no |
| `/reset-password` | recovery | no |
| `/select-company` | authenticated | no |
| `/no-access` | authenticated | no |
| `/forbidden` | authenticated | no |
| Business routes | authenticated | yes |

Permission metadata:

- `/projects/**` requires `project.read`;
- `/my-work` requires `task.read_assigned`;
- `/employees/**` requires any of `employee.read_directory`, `employee.read_all`;
- drawings routes additionally require `drawing.read`.

A missing permission redirects to `/forbidden` without logging out.

Frontend permission checks improve UX and fail closed early; every business endpoint remains responsible for server-side authorization.

Redirect query values must be internal paths only:

- start with `/`;
- not start with `//`;
- contain no scheme or origin;
- not target a guest/recovery route in an invalid state.

---

## 13. Session lifecycle

### Bootstrap

```text
getSession()
  ├─ no session → anonymous
  └─ session → GET /api/auth/session
       ├─ success → authenticated
       ├─ network/5xx → connection_error, keep Supabase session
       └─ AUTH_INVALID → refresh once, retry once, then sign out
```

A local Supabase session alone never authorizes Taskovia UI.

### Revalidation triggers

Refresh the app session on:

- application bootstrap;
- successful login;
- a meaningful Supabase session/token event;
- tab becoming visible;
- company switch;
- `AUTH_INVALID`;
- `COMPANY_FORBIDDEN`;
- `PERMISSION_DENIED`.

Use single-flight and a short visibility throttle. Do not poll and do not use Realtime in v1.

### Network failure

Network/5xx:

- does not delete the Supabase session;
- does not render business routes with cached permissions;
- shows a connection error with Retry and Logout;
- does not retry continuously.

---

## 14. Validation and password rules

### Login

- trim and normalize email;
- email required and syntactically valid;
- password required but not checked against the new length policy;
- double submit blocked.

### Forgot password

- valid normalized email;
- always show the same success message:
  `Nếu email tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu đã được gửi.`

### Set/reset password

- 12–72 characters;
- password is not trimmed;
- whitespace-only is invalid;
- confirmation must match exactly;
- double submit blocked.

Invalid input causes zero repository, Supabase and Nitro calls.

---

## 15. Frontend error contract

```ts
type ClientErrorKind =
  | 'validation'
  | 'authentication'
  | 'authorization'
  | 'network'
  | 'rate_limit'
  | 'api'
  | 'unexpected'

interface ClientError {
  kind: ClientErrorKind
  code: string
  message: string
  fieldErrors?: Record<string, string>
  requestId?: string
  retryable: boolean
}
```

Stable codes include:

```text
VALIDATION_FAILED
INVALID_CREDENTIALS
ACCOUNT_NOT_READY
PASSWORD_RESET_FAILED
PASSWORD_COMPROMISED
PASSWORD_POLICY_REJECTED
AUTH_REQUIRED
AUTH_INVALID
COMPANY_FORBIDDEN
PERMISSION_DENIED
RATE_LIMITED
NETWORK_ERROR
MALFORMED_RESPONSE
INTERNAL_ERROR
```

Never expose raw AuthError, Postgres errors, stack traces, constraint names, tokens, service-role keys or raw provider bodies.

`AUTH_INVALID` can refresh and retry one read request once. Mutations are never automatically retried.

---

## 16. Identity display

Access requires:

```text
valid Auth identity
+ valid company membership
+ required permission
```

An employee record is optional.

Display order:

1. linked employee name/avatar when available in a future task;
2. Auth email;
3. initials derived from display value.

Auth v1 does not create an employee record.

---

## 17. UI

Taskovia-branded Auth layout is used by all auth/access-state pages.

Requirements:

- accessible labels;
- field error linked with `aria-describedby`;
- form alert with `role="alert"`;
- focus first invalid field;
- loading and duplicate-submit prevention;
- password show/hide;
- responsive desktop/mobile;
- reduced-motion support;
- no account-enumeration messages.

The default app shell:

- uses the authenticated user email/initials;
- uses the selected company from the company-access store;
- supports logout;
- shows the company switcher only when more than one company exists;
- filters navigation by current permissions.

Mock business repositories remain unchanged.

---

## 18. Local and Cloud DEV Auth configuration

### Versioned local config

`supabase/config.toml` must express:

```text
invite-only signup policy
site URL http://127.0.0.1:3000
exact callback allowlist
minimum password length 12
no composition rule
versioned invite/recovery templates
```

### Taskovia Cloud DEV

Target:

```text
gtgljlnhwvhqdnwrfdfj
```

Authorized Auth-only changes:

```text
site_url
uri_allow_list
disable_signup = true
password_min_length = 12
password_required_characters = no composition requirement
invite/recovery subjects and templates
password_hibp_enabled = true when the plan supports it
```

Do not:

- alter Production;
- upgrade billing;
- modify database schema/data;
- reset or seed;
- modify the retired VQH project.

If leaked-password protection is unavailable on the current plan, record the limitation. Source implementation can complete, but Production remains blocked until the control is available and enabled.

---

## 19. Testing

### Unit

- auth schemas;
- URL/callback builder;
- redirect sanitizer;
- provider error mapper;
- API error mapper and request ID;
- malformed response rejection;
- Supabase repository contract;
- authenticated HTTP client;
- auth service transitions;
- Pinia auth/company stores;
- active company persistence validation;
- access policy;
- single-flight and one-refresh retry;
- connection-error fail-closed behavior;
- backend session service;
- invite redirect propagation.

### Playwright E2E

Use controlled external-boundary interception and a Playwright authenticated storage state. Do not commit a password.

Coverage:

- anonymous protected-route redirect;
- login success/failure;
- persistent restore;
- logout;
- generic forgot-password response;
- invite/recovery token-hash callback;
- reset password;
- no access;
- company selection and switching;
- forbidden route;
- connection error;
- mobile and accessibility checks;
- all existing prototype E2E specs running under an authenticated fixture.

### Live Cloud DEV smoke

Use credentials supplied only at runtime to verify:

```text
login
→ GET /api/auth/session
→ VQH
→ company_admin
→ 34 canonical permissions
```

No credential or token is written to source, prompt, report or Git history.

---

## 20. Acceptance criteria

1. Pinia is installed and configured for `app/stores/**`.
2. UI/store/service/repository boundaries are enforced.
3. No raw external call exists in a page, component or store.
4. Backend session route delegates to an auth-session service.
5. Email/password sign-in works for invited users.
6. Persistent session restores through verified app-session bootstrap.
7. Logout clears Auth and company runtime state.
8. Forgot-password does not enumerate accounts.
9. Invite/recovery uses token hash verification and no access-token URL fragment.
10. Reset continues with the verified session.
11. Active-company rules work for zero, one and multiple companies.
12. Routes are protected by default.
13. Routes and navigation are permission aware.
14. Frontend validation prevents invalid external calls.
15. Raw provider errors never reach UI.
16. `requestId` survives Nitro error mapping.
17. `AUTH_INVALID` refreshes/retries at most once.
18. Network/5xx fails closed without deleting the local Supabase session.
19. Password policy is 12–72, passphrase-friendly and no-trim.
20. Tokens/passwords are not persisted outside Supabase Auth.
21. External redirects are rejected.
22. Taskovia Cloud DEV uses exact Auth callback/template/invite-only settings.
23. Leaked-password protection is enabled when supported or reported as a plan limitation.
24. Mock business repositories remain unchanged.
25. No employee record, signup, OAuth, magic-link login, MFA, database migration or Production change is introduced.
26. Unit, typecheck, lint, build and E2E pass.
27. Live Cloud DEV smoke proves VQH/company_admin/34 permissions.
28. The implementation branch is pushed and its remote HEAD is verified.

---

## 21. Codex decision boundary

Codex may decide internal naming, component decomposition, exact Pinia syntax, single-flight implementation, CSS details and test-file decomposition.

Codex must not change:

- invite-only scope;
- direct browser-to-Supabase credential boundary;
- token-hash callback requirement;
- store/service/repository separation;
- persistent-session policy;
- default-protected routes;
- active-company behavior;
- permission-aware routing;
- password policy;
- stable error behavior;
- Cloud DEV/Production boundaries;
- Auth-only task scope.

---

