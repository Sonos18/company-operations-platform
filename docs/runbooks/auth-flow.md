# Taskovia Auth flow operations

This runbook operates the invite-only Taskovia Auth v1 flow. It covers local development and the canonical Taskovia Cloud DEV project `gtgljlnhwvhqdnwrfdfj`. It does not authorize a database migration, reset, seed, Auth-user deletion, billing change, custom SMTP setup, Production configuration, or deployment.

## Runtime configuration and secrets

Copy `.env.example` to the ignored `.env.local` and set:

| Variable | Boundary | Purpose |
| --- | --- | --- |
| `NUXT_PUBLIC_APP_URL` | Public runtime | Canonical application origin. Local DEV is exactly `http://127.0.0.1:3000`. |
| `NUXT_PUBLIC_SUPABASE_URL` | Public runtime | Selected Supabase project URL. |
| `NUXT_PUBLIC_SUPABASE_ANON_KEY` | Public runtime | Selected Supabase publishable/anon key. |
| `NUXT_SUPABASE_SERVICE_ROLE_KEY` | Server-only runtime | Narrow invitation/offboarding Admin operations. Never expose it under `NUXT_PUBLIC_*`. |

The application URL must be an absolute origin without credentials, query, or fragment. HTTPS is mandatory except for `localhost` and `127.0.0.1`. Taskovia derives the callback as `<origin>/auth/callback`; it never trusts a request `Host` header for this value.

Cloud DEV CLI operations use only `SUPABASE_DEV_ACCESS_TOKEN` from ignored `.supabase.dev.env.local`, as described in [Cloud DEV backend development](../development/backend-cloud-dev.md). The PAT is not an application variable. Never put a PAT, service-role key, access token, refresh token, password, or email token in source control, logs, tickets, screenshots, or shell history.

## Invite and first password

1. An authorized employee administrator starts onboarding through the Taskovia API. Do not create or transmit a password for the invitee.
2. The server calls Supabase Admin `inviteUserByEmail` with the exact callback `http://127.0.0.1:3000/auth/callback` in local/Cloud DEV.
3. The versioned invite template must link to `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=invite`.
4. `/auth/callback` accepts only one `token_hash` and `type=invite|recovery`, verifies it once with `verifyOtp`, immediately removes the sensitive query from browser history, and sends the user to `/reset-password`.
5. The user sets a 12–72 character password. Taskovia does not trim it or require a composition rule; whitespace-only and non-matching confirmation are rejected locally.
6. After update, the recovery marker is removed and Taskovia revalidates the application session before rendering protected content.

Do not paste an invitation URL into logs or tickets. The token hash is single-use sensitive data even though Taskovia never persists it.

## Forgot and reset password

1. Open `/forgot-password` and submit a normalized email address.
2. Taskovia always shows the same non-enumerating response: `Nếu email tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu đã được gửi.`
3. Supabase sends the recovery email with the exact callback. The versioned recovery template must link to `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery`.
4. The callback and password-update sequence is the same as the invite flow. A non-secret recovery marker exists only in `sessionStorage` for at most 15 minutes.

If the callback is missing, malformed, duplicated, expired, already used, or has another `type`, restart the invite/recovery operation. Never transform it into an access-token URL fragment or use `exchangeCodeForSession` for this flow.

## Sign in, company access, and logout

Invited users sign in at `/login` with email/password. A Supabase session alone is insufficient: Taskovia calls `GET /api/auth/session` with the current Bearer token, resolves company membership through RLS, and renders the application only after successful revalidation.

- Zero active companies routes to `/no-access`.
- One active company is selected automatically.
- Multiple companies route to `/select-company`; only a revalidated company ID is persisted.
- Permission denial routes to `/forbidden` and does not sign the user out.
- Network or retryable API failure activates the global connection-error state, preserves the provider session, and offers Retry or Logout.

Logout clears the Supabase session plus Taskovia user/company runtime state, then revalidates navigation to `/login`. Do not use browser storage deletion as an operator logout substitute.

## Common safe error codes

| Code | Meaning and operator action |
| --- | --- |
| `VALIDATION_FAILED` | Correct the highlighted local input. No external request was sent. |
| `INVALID_CREDENTIALS` | Email/password was rejected. Do not disclose whether an account exists. |
| `ACCOUNT_NOT_READY` | The invited account is not ready or is disabled. Verify Auth status through an authorized admin path. |
| `AUTH_REQUIRED` | No usable provider session exists; return to login. |
| `AUTH_INVALID` | The session is invalid/expired; Taskovia allows one refresh and one read retry before logout. |
| `COMPANY_FORBIDDEN` / `PERMISSION_DENIED` | Reconcile active membership and normalized role assignments; do not bypass the route guard. |
| `RATE_LIMITED` | Wait before retrying. Do not automate repeated credential or email mutations. |
| `NETWORK_ERROR` | Retry from the connection-error state; the provider session is intentionally preserved. |
| `MALFORMED_RESPONSE` / `INTERNAL_ERROR` | Capture the safe `requestId` when present and inspect server logs without copying response bodies or secrets. |

Raw Supabase errors, Postgres details, stack traces, tokens, provider bodies, and service-role values must never reach the UI.

## Cloud DEV Auth configuration

Before any authorized read or change, run:

```powershell
pnpm db:dev:auth-check
pnpm db:dev:target
pnpm db:dev:status
pnpm db:dev:dry-run
```

The required Auth configuration is:

| Field | Required Cloud DEV value |
| --- | --- |
| `site_url` | `http://127.0.0.1:3000` |
| `uri_allow_list` | `http://127.0.0.1:3000/auth/callback` |
| `disable_signup` | `true` |
| `password_min_length` | `12` |
| `password_required_characters` | Empty; no composition rule |
| Invite/recovery subjects and HTML | Exact committed values in `supabase/config.toml` and `supabase/templates/` |
| `password_hibp_enabled` | `true` only when the current plan supports it |

As verified on 2026-08-28, the five core fields above match in Cloud DEV. The organization is on the Free plan, so leaked-password protection is unavailable. Supabase also rejects changes to both email subjects and HTML templates for this new Free-plan project using the default email provider. The hosted subjects/templates therefore do not yet match the committed files, and live invite/recovery callback acceptance is blocked until an owner separately authorizes either a paid plan or custom SMTP. Do not change billing or SMTP under this runbook. See Supabase's [Free-tier template restriction](https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier) and [password security plan requirement](https://supabase.com/docs/guides/auth/password-security).

After any separately authorized Auth-only change, read back only the approved fields without printing template bodies or secrets, then prove no database drift:

```powershell
pnpm db:dev:status
pnpm db:dev:dry-run
pnpm db:dev:canonical-check
pnpm db:dev:rls-smoke
pnpm db:dev:advisors:security
```

## Live Cloud DEV smoke

Use an existing invited, login-capable VQH administrator. Supply its email and password only as process-scoped runtime input; do not save them in an env file or command argument, and clear the process variables immediately afterward. The smoke must not create, invite, reset, disable, or delete an Auth user.

Verify only sanitized facts:

```text
authenticated email equals the runtime account
companyCode = VQH
roles includes company_admin
permissionCount = 34
```

Never print or persist the password, access token, refresh token, complete session response, roles/permissions payload, or Supabase provider response. Logout after the smoke and confirm a protected route returns to `/login`.

## Production boundary

Cloud DEV public values, CLI link state, Auth settings, callbacks, PAT, and smoke credentials must not be copied to Vercel Production. Production Auth configuration and deployment require a separate current authorization, separate Supabase project values, HTTPS site/callback URLs, leaked-password protection, and successful hosted invite/recovery template verification.
