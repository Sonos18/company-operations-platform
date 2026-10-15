# HR employee invitations (SMTP delivery with manual fallback)

HR submits the invitation form. Taskovia prepares a one-time invite link and, when `NUXT_SMTP_*` is configured, sends it from the company domain mailbox. If SMTP is unset (`delivery: manual`) or sending fails (`delivery: failed`), HR copies the prepared email and sends it privately. `sent` means the SMTP server accepted the message, not that it was delivered.

## Application flow

- Both `account.invite` and `employee.create` are required. The tenant and company come from the verified user context, not the form body.
- `GET /api/companies/:companyId/employee-invitations/options` lists active scoped departments/positions through the user's RLS client.
- `POST /api/companies/:companyId/employee-invitations/manual` prepares the invitation, then delivers it through SMTP. A `sent` response omits the body, so the token never reaches the browser. The former `inviteUserByEmail` endpoint has been removed.
- The Admin adapter inspects the normalized email, rejects activated/disabled identities, and rejects pending identities without a matching server-written `app_metadata.taskovia_manual_invitation` tenant/company marker. User-editable `user_metadata` is never ownership proof.
- For a new email, Admin `createUser` creates an unconfirmed identity and its server ownership marker in one transaction; duplicate/competing emails fail closed. Then `generateLink(type: invite)` creates the link. Neither operation sends email or issues recovery/magic links.
- The existing user-token onboarding RPC creates the active memberships, employee/private shell, and base employee role. Additional roles are not part of the invitation form.
- A pending employee must match the stored code, email, full name, department, position, and hire date, and must not be terminated. Omitted position/hire date match only stored null values. Reissue is not a profile edit: update the employee through the existing profile-edit flow, then reissue using the stored values. The forward guard migration also rejects terminated employees inside the locked RPC transaction, rolling back membership changes.
- Recheck the pending Auth identity after onboarding before returning the email. The callback is built from configured app origin and `hashed_token`, using `type=invite`. Do not forward the provider `action_link`.
- The recipient verifies the invite and sets their own 8–72 character password. The shared password-setting schema also serves recovery; this patch changes its bounds only. Forgot-password routes, email requests, and routing are unchanged.

## SMTP delivery setup (owner)

1. In the mail provider, publish SPF and DKIM for the domain, and add DMARC (`p=none` to start). Without these, invitations land in Spam.
2. Create or choose the sender mailbox/alias (`noreply@<domain>`) and an app-specific password if the provider supports it.
3. Set the `NUXT_SMTP_*` env vars in `.env.local` (local) and in the deployment's server-only env (Vercel/Insta).
4. Optional but recommended: in the Supabase Dashboard → Auth → SMTP Settings, enter the same mailbox so forgot-password emails and custom templates work.

| Env var | Rule |
|---|---|
| `NUXT_SMTP_HOST` | Hostname, e.g. `smtp.zoho.com`, `smtppro.zoho.com`, `smtp.hostinger.com`, `mail.<domain>` |
| `NUXT_SMTP_PORT` | `465` (implicit TLS) or `587` (STARTTLS, TLS required). Default `465`. Anything else is invalid. |
| `NUXT_SMTP_USER` | Mailbox login |
| `NUXT_SMTP_PASS` | Mailbox or app-specific password. Never `NUXT_PUBLIC_`. |
| `NUXT_SMTP_FROM` | Sender address, e.g. `noreply@<domain>`. Must be the mailbox or an alias the provider allows. |

If host, user, pass and from are all empty, SMTP is treated as not configured and invitations use the manual fallback.

The server's function max duration must allow invitation preparation plus up to about 25 s of SMTP time (5 s DNS lookup plus the 20 s send deadline). A shorter limit can kill the request before the `failed` fallback is returned.

### Troubleshooting SMTP

- Invitations always show the manual state: check the server logs for `SMTP_CONFIG_INVALID`. It lists the names of the invalid fields (for example `['port']`), never their values.
- `NUXT_SMTP_HOST` must be a bare hostname: no `smtp://` prefix and no `:port` suffix.
- `NUXT_SMTP_PORT` must be `465` or `587`.
- `NUXT_SMTP_FROM` must be a plain email address, without a display name.
- Nuxt reads purely numeric env values as numbers. Passwords made only of digits work, but values such as `1e5` or 16+ digit passwords cannot be recovered exactly. Use an app password that contains letters.
- `failed` with `INVITATION_EMAIL_SEND_FAILED EAUTH`: wrong user or password, or SMTP is not enabled for the mailbox.
- `failed` with `INVITATION_EMAIL_SEND_FAILED ETIMEDOUT`: the host or port is blocked by the hosting provider, or the server did not answer in time.

## Sensitive handoff

The API response is `Cache-Control: no-store`. The UI holds the prepared email in component memory only and clears it on close, navigation, company change, or loss of invitation permissions. Copying requires an explicit HR click. It never places the token in a Gmail compose URL, logs, analytics, or browser storage. Clipboard and the email HR sends contain a bearer credential; HR must verify the recipient and avoid groups/forwarding. Server logs contain only `SMTP_CONFIG_INVALID` or `INVITATION_EMAIL_SEND_FAILED <code>`; never addresses, bodies, or credentials.

The form shows one of three states. None of them is evidence of inbox delivery or account activation.

- **sent** — “Đã gửi email mời · Máy chủ email đã nhận”. The SMTP server accepted the message. No email body and no copy button are shown, so the link never reaches the browser. Ask the recipient to check Spam. Reissuing generates a new link.
- **manual** — “Đã chuẩn bị · Chưa xác nhận gửi”. SMTP is not configured; HR copies the prepared email and sends it privately.
- **failed** — the same status and copy flow as manual, plus the warning “Không gửi được email tự động…”. SMTP is configured but the send failed; HR sends the copied email manually.

Supabase controls link expiry; the 15-minute browser recovery marker is not the email link lifetime.

## Retry and limitations

Auth creation with ownership, link generation, and database onboarding are separate transactions. Failed link generation or onboarding leaves an owned unconfirmed draft/pending identity; retry the same company/email/code. An owned draft without invited_at can generate a link, but no credential is returned until invited_at and onboarding are verified. Unknown creation outcomes require retry inspection; unmarked identities remain ineligible. No Auth user is automatically deleted.

The sender mailbox's Sent folder (Zoho saves SMTP sends by default) keeps copies of sent invitations, including live invite links. Restrict access to that mailbox or disable saving sent copies.

Pending invitations from older flows without the marker are intentionally rejected. Activated existing accounts are not reset or linked through this form. Reissuing never generates recovery/magic links. Forgot-password support and recovery delivery are outside this pilot.

The endpoint has an instance-local 5-per-minute actor/company throttle and serializes concurrent preparations for the same email in the same server process. These are not distributed locks. Ownership is atomic with new Auth creation, including against competing legacy invitations. Reissue ordering across instances and activation during onboarding remain non-atomic. Keep the pilot on one instance; final identity checks fail closed before credential release, but Auth and onboarding do not share a transaction. Do not promise that a new invite invalidates all previous links without provider verification.

## Deployment prerequisites and hosted DEV evidence

1. Apply `20261003074553_hr_manual_invitation_terminated_guard.sql` only with separate Cloud DEV migration authorization and verification. Do not release pending reissue without this guard.
2. Configure the server-only service-role key via secure runtime settings. The inspected dev-preview environment lacked it. Never put it in public config, the browser, source, or this runbook.
3. Set the canonical HTTPS preview application origin and authorize its exact `/auth/callback` in Cloud DEV.
4. Hosted Cloud DEV `password_min_length=8` was separately authorized and set on 2026-10-03; a read-only check on 2026-10-04 at 13:47:02 UTC confirmed 8 with no composition rule on `gtgljlnhwvhqdnwrfdfj`. This applies to password creation/change and recovery in that project. Committed config alone does not change hosted Auth; Production remains a separate boundary.
5. Live invitation/account creation and provider link-expiry/reissue testing need separately approved test recipients and mutations. Provider verification uses mocked responses. The bounded synthetic Cloud DEV rollback rehearsal covers the HR database lifecycle and confirms zero retained fixtures; see [the runner checkpoint](../development/hr-invitation-runner-checkpoint.md). Multi-session concurrency and live provider expiry/reissue tests remain deferred.

## Reissue profile consistency release

Apply `20261004140132_hr_invitation_profile_guard.sql` only after separate Cloud DEV migration approval. It preserves onboarding permissions, tenant/role scope, and the terminated guard, while rejecting changed profile values under the existing employee row lock. It also makes the existing onboarding RPC reject mismatched existing profiles; it does not update them.

The manual service checks the full stored profile before generating a pending reissue, checks the onboarding result, then rereads the scoped employee before releasing the credential. The greeting and recipient come from that persisted row. A preflight mismatch leaves the old link untouched. A concurrent change caught after generation returns no credential, although generation may already have rotated the previous link. Auth and database reads are separate transactions; edits after the last read remain possible.

The corrective migration requires the separately authorized guarded Cloud DEV apply. Unit, browser, and bounded synthetic rollback evidence support this release; multi-session concurrency coverage remains explicitly deferred.
