# Employee invitation SMTP delivery design

Date: 2026-10-15
Status: Draft for owner review

## Problem

HR invites a new employee from `/employees` → "Mời nhân viên". Today the server prepares a one-time invite link (`createUser` with an ownership marker, then `generateLink(type: invite)`) and returns the email subject and body to the browser. HR copies it and sends it from their own Gmail. Taskovia never sends email.

A second, older flow (`POST /api/companies/:companyId/employee-invitations` → Supabase `inviteUserByEmail`) still exists on the server. No UI calls it. It is blocked on Cloud DEV because the Free-plan default email provider cannot use custom templates. It also adopts an *existing* Auth account into the company (`kind: 'existing'` → `findUserByEmail` → onboarding), which the manual flow deliberately refuses.

The owner now has a domain mailbox (Zoho / Hostinger / cPanel style SMTP) and wants invitations sent automatically, with the copy-and-send path kept as a fallback.

## Decision

Option B from the session discussion: **the Nuxt server sends the already-prepared invitation through the domain SMTP mailbox**. All identity and ownership checks of the manual flow stay exactly as they are. Delivery is a new, separate step after preparation.

Rejected: Option A (Supabase custom SMTP + `inviteUserByEmail`). It cannot write the `app_metadata` ownership marker atomically with user creation, relies on undocumented GoTrue re-invite behaviour for unconfirmed users, and gives no per-send result.

## Goals

1. When SMTP is configured, "Gửi lời mời" prepares the link and sends the email from the domain address in one request.
2. When SMTP is not configured, behaviour is identical to today (prepared + copy).
3. When SMTP is configured but sending fails, HR gets the prepared email and the copy button, plus a clear warning.
4. Remove the unused `inviteUserByEmail` flow so there is one invitation path.
5. No secret (SMTP password, service-role key, invite token) ever reaches logs, the browser bundle, or browser storage. The invite token reaches the browser **only** in the fallback states.

## Non-goals

- Delivery/open tracking, bounces, retries/queues.
- HTML email templates (plain text, same body as today).
- Configuring Supabase Auth custom SMTP for password-recovery emails. This is an owner dashboard step listed in the runbook, not code.
- Renaming the `/employee-invitations/manual` endpoint URL.
- Distributed locking or multi-instance rate limiting (existing pilot limits stay).

## Architecture

```
EmployeeInvitationForm.vue
  └─ POST /api/companies/:companyId/employee-invitations/manual   (unchanged URL)
       manual-invitation.routes.ts  (auth context, permission, throttle — unchanged)
         1. createManualEmployeeInvitationService(...).prepare()   → PreparedEmployeeInvitation (unchanged)
         2. parseSmtpConfig(runtime.smtp)                          → SmtpConfig | null      (NEW)
         3. deliverInvitation(draft, mailer | null)                → EmployeeInvitationResult (NEW)
              mailer = createSmtpInvitationMailer(config)          (NEW, nodemailer)
```

### New units

| File | Responsibility |
|---|---|
| `server/utils/smtp-config.ts` | Parse and validate SMTP runtime config. Returns `null` when unset or invalid. |
| `server/utils/smtp-mailer.ts` | nodemailer adapter implementing `InvitationMailer`. Only file that imports `nodemailer`. |
| `server/features/employees/invitation-delivery.ts` | `InvitationMailer` port and `deliverInvitation()`: maps a draft plus send outcome to the API result. |

### Response contract (`shared/schemas/employee-invitations.ts`)

`preparedEmployeeInvitationSchema` stays as the server-internal draft shape. A new public result schema is added:

```ts
// status 'sent': the SMTP server accepted the message. The body (and therefore the token) is NOT returned.
{ status: 'sent', recipient: string, subject: string }
// status 'prepared': HR must send it manually.
{ status: 'prepared', recipient: string, subject: string, body: string, delivery: 'manual' | 'failed' }
```

- `delivery: 'manual'`: SMTP not configured (or config invalid). Same UX as today.
- `delivery: 'failed'`: a send was attempted and threw, or the recipient was rejected.

### SMTP configuration

Server-only `runtimeConfig.smtp` → env vars:

| Env var | Rule |
|---|---|
| `NUXT_SMTP_HOST` | Hostname, e.g. `smtp.zoho.com`, `smtppro.zoho.com`, `smtp.hostinger.com`, `mail.<domain>` |
| `NUXT_SMTP_PORT` | `465` (implicit TLS) or `587` (STARTTLS, TLS required). Default `465`. Anything else is invalid. |
| `NUXT_SMTP_USER` | Mailbox login |
| `NUXT_SMTP_PASS` | Mailbox or app-specific password. Never `NUXT_PUBLIC_`. |
| `NUXT_SMTP_FROM` | Sender address, e.g. `noreply@<domain>`. Must be the mailbox or an alias the provider allows. |

- If host, user, pass and from are all empty → not configured (`null`), silently.
- If any is set but the set is invalid → `null`, plus one log line `SMTP_CONFIG_INVALID` with no values.
- Display name is fixed: `Taskovia`.

### Mailer behaviour

- One transporter per request (serverless friendly, no pool).
- `secure: port === 465`, `requireTLS: port === 587`, `tls.minVersion: 'TLSv1.2'`.
- Timeouts: connection 10 s, greeting 10 s, socket 15 s, so a dead SMTP server cannot hang the request.
- `sendMail({ from: { name: 'Taskovia', address: from }, to, subject, text })`.
- Success requires `info.accepted` to contain the recipient and `info.rejected` not to. Otherwise it throws.

### Delivery logging

On failure, log exactly `console.error('INVITATION_EMAIL_SEND_FAILED', code)`. `code` is the nodemailer error `code` if it matches `/^[A-Z][A-Z0-9_]{1,31}$/` (e.g. `EAUTH`, `ETIMEDOUT`, `EENVELOPE`), else `'UNKNOWN'`. Never log the message, response, recipient, body, or credentials.

### UI (`EmployeeInvitationForm.vue`)

| State | Status line | Content |
|---|---|---|
| form | n/a | Submit button `Gửi lời mời`. Help: "Taskovia gửi email mời từ địa chỉ email của công ty. Nếu chưa gửi được, bạn có thể sao chép và gửi thủ công." |
| `sent` | `Đã gửi email mời · Máy chủ email đã nhận` | Recipient and subject (read-only). Help: "Nếu người nhận không thấy email, hãy nhờ họ kiểm tra thư mục Spam. Tạo lại lời mời sẽ cấp link mới." No body, no copy button. |
| `prepared` + `manual` | `Đã chuẩn bị · Chưa xác nhận gửi` (unchanged) | Today's copy UI. |
| `prepared` + `failed` | `Đã chuẩn bị · Chưa xác nhận gửi` | `role="alert"` warning "Không gửi được email tự động. Hãy sao chép và gửi thủ công cho đúng người nhận." above today's copy UI. |

Copy confirmation changes from "Hãy dán vào Gmail…" to "Đã sao chép. Hãy dán vào ứng dụng email và gửi riêng đúng người nhận."

All existing sensitive-handling rules stay: memory only, cleared on close, unmount, or company change.

### Removal of the old automatic flow

Delete:
- `server/api/companies/[companyId]/employee-invitations.post.ts`
- `invite` and `authorizeInvitation` in `employee.routes.ts` and `employee.service.ts`, plus helpers used only by them (`normalizeInvitation`, `validatedOnboardingResult`, `accountInviteFailed`, `onboardingIncomplete`, and the `invitationAuthAdmin` factory)
- `createSupabaseInvitationAuthAdmin` and its now-unused helpers in `server/utils/supabase-client.ts`, and `'inviteUserByEmail'` from the `SupabaseAdminClient` `Pick`
- `EmployeeInvitationAuthAdmin`, `EmployeeInvitationAuthResult`, `EmployeeInvitationUserLookup` in `employee-invitation-auth.ts` (keep the offboarding types)
- Their unit tests

Keep: `repository.completeEmployeeOnboarding` (used by the manual flow) and the `ACCOUNT_INVITE_FAILED` / `ONBOARDING_INCOMPLETE` error codes (used by the manual flow).

## Security review

- **AuthN/AuthZ**: unchanged. The route still resolves the user context server-side and requires `account.invite` + `employee.create` before reading the body. Sending happens only after the existing preparation succeeds.
- **Input**: the recipient comes from the persisted employee row (`persisted.workEmail`), already validated by zod. The subject is a constant. No user input reaches SMTP headers beyond the validated email, and nodemailer encodes headers.
- **Secrets**: SMTP credentials live only in server `runtimeConfig`. A unit test asserts `runtimeConfig.public` has no `smtp` key.
- **Token exposure is reduced**: in the `sent` state the token never reaches the browser.
- **Account takeover risk removed**: deleting the `inviteUserByEmail` route removes the only path that adopted an existing active account.
- **DB permissions**: no schema or RLS change.

## Known limitations

- `sent` means the SMTP server accepted the message, not that it was delivered. The UI wording says so.
- The per-email preparation lock is released before sending. A concurrent reissue for the same email can rotate the link while the first email is in flight, so the first email may carry a stale link. This is acceptable for the pilot and mirrors the existing reissue caveat.
- Provider sending limits (Zoho/Hostinger: hundreds per day) are far above HR needs. The existing 5-per-minute throttle still applies.
- If the send throws after the SMTP server actually accepted the message (rare), HR may send a duplicate manually. Both copies carry the same link.

## Owner operations (not code)

1. In the mail provider, publish SPF and DKIM for the domain, and add DMARC (`p=none` to start). Without these, invitations land in Spam.
2. Create or choose the sender mailbox/alias (`noreply@<domain>`) and an app-specific password if the provider supports it.
3. Set the `NUXT_SMTP_*` env vars in `.env.local` (local) and in the deployment's server-only env (Vercel/Insta).
4. Optional but recommended: in the Supabase Dashboard → Auth → SMTP Settings, enter the same mailbox so forgot-password emails and custom templates work.

## Acceptance

- Unit: config parsing, mailer adapter (mocked transport), delivery mapping, route composition, runtime-config secrecy, and removal of the old route all pass.
- E2E (Playwright, mocked API): the `sent`, `prepared/manual`, and `prepared/failed` UI states.
- `pnpm verify:app` passes (unit, typecheck, lint, build).
- Manual smoke (owner, with real SMTP): invite an approved test address and receive it in the inbox (not Spam). The link opens `/auth/callback` and leads to setting a password.
